import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import { submitMessageTemplate } from '@/lib/whatsapp/meta-api'
import {
  validateTemplatePayload,
  type TemplatePayload,
} from '@/lib/whatsapp/template-validators'
import { buildMetaTemplatePayload } from '@/lib/whatsapp/template-components'
import {
  ensureHeaderMediaHandle,
  reuseStoredHeaderHandle,
} from '@/lib/whatsapp/template-header-handle'
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize'
import { TEMPLATE_SUBMIT_PROCESSING } from '@/lib/whatsapp/template-submit-processing'
import { normalizeMetaTemplateLanguage } from '@/lib/whatsapp/template-language'

/** Image headers download from Supabase + upload to Meta — can exceed default limits. */
export const maxDuration = 120

/**
 * Shared upsert payload builder — both the Meta-failure path and the
 * Meta-success path write nearly identical rows; dropping the shared
 * fields here means adding a column later only touches one spot.
 */
function buildUpsertRow(
  accountId: string,
  userId: string,
  payload: TemplatePayload,
  extras: {
    status: 'DRAFT' | string
    metaTemplateId: string | null
    submissionError: string | null
  },
) {
  return {
    // Account tenancy — required NOT NULL on message_templates as
    // of migration 017. Without this an INSERT throws on the
    // not-null constraint.
    account_id: accountId,
    // Original author — kept as audit only. The unique index is
    // still on (user_id, name, language) — see the upsert helper
    // for the cross-teammate dedup follow-up.
    user_id: userId,
    name: payload.name,
    category: payload.category,
    language: payload.language,
    header_type: payload.header_type ?? null,
    header_content: payload.header_content ?? null,
    header_media_url: payload.header_media_url ?? null,
    header_handle: payload.header_handle ?? null,
    body_text: payload.body_text,
    footer_text: payload.footer_text ?? null,
    buttons: payload.buttons ?? null,
    sample_values: payload.sample_values ?? null,
    status: extras.status,
    meta_template_id: extras.metaTemplateId,
    submission_error: extras.submissionError,
    // Clear stale rejection_reason whenever we re-submit; the
    // webhook will set it again if Meta still rejects.
    rejection_reason: extras.submissionError ? null : null,
    last_submitted_at: new Date().toISOString(),
    // Fresh submission — approval time is unknown until Meta/webhook/sync.
    approved_at: extras.status === 'APPROVED' ? new Date().toISOString() : null,
  }
}

async function upsertTemplateRow(
  supabase: SupabaseClient,
  row: ReturnType<typeof buildUpsertRow>,
) {
  // TODO(account-sharing): conflict target is still scoped to
  // user_id. Once a follow-up migration drops the legacy unique
  // index on (user_id, name, language) and adds (account_id,
  // name, language), switch `onConflict` here so two teammates
  // can't shadow each other's same-named template.
  return supabase
    .from('message_templates')
    .upsert(row, { onConflict: 'user_id,name,language' })
    .select()
    .single()
}

/**
 * Submit a template to Meta for approval AND persist it locally.
 *
 * Auth → fetch whatsapp_config → validate → (DRY_RUN short-circuit) →
 * POST to Meta → upsert local row by (user_id, name, language) with
 * status, meta_template_id, sample_values, last_submitted_at.
 *
 * When WHATSAPP_TEMPLATES_DRY_RUN=true, we skip the network call and
 * insert a row with a synthetic `dry-run-<uuid>` meta_template_id so
 * CI / local dev can exercise the full UI without a real Meta App.
 *
 * On the Meta side this is a one-way trip — a row can only be
 * submitted; editing or deleting requires hsm_id and lives in PR 4.
 */
export async function POST(request: Request) {
  try {
    // Message templates are settings-class data: `canEditSettings` and the
    // message_templates_insert/update RLS policies (migration 017) both
    // require 'admin'. Resolving account_id off the profile only proved
    // membership, so a viewer or agent could push a template to Meta for
    // approval — an external side effect RLS can't roll back — before the
    // local upsert was refused.
    const { supabase, accountId, userId } = await requireRole('admin')

    let payload: TemplatePayload
    try {
      payload = (await request.json()) as TemplatePayload
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    if (payload.category === 'Authentication') {
      return NextResponse.json(
        {
          error:
            'AUTHENTICATION templates are not yet supported here — create them in Meta WhatsApp Manager and use "Sync from Meta".',
        },
        { status: 400 },
      )
    }

    try {
      validateTemplatePayload(payload)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Validation failed.' },
        { status: 400 },
      )
    }

    // Meta uses `kn` / `hi`, not `kn_IN` / `hi_IN` — normalize before DB + API.
    payload.language = normalizeMetaTemplateLanguage(payload.language)

    const dryRun =
      process.env.WHATSAPP_TEMPLATES_DRY_RUN === 'true' ||
      process.env.WHATSAPP_TEMPLATES_DRY_RUN === '1'

    let metaTemplateId: string
    let metaStatus: string

    if (dryRun) {
      metaTemplateId = `dry-run-${crypto.randomUUID()}`
      metaStatus = 'PENDING'
    } else {
      const templateName = payload.name
      const templateLanguage = payload.language

      // Respond immediately — Cloudflare caps proxied requests at ~100s.
      void (async () => {
        const started = Date.now()
        try {
          const { data: config, error: configError } = await supabase
            .from('whatsapp_config')
            .select('*')
            .eq('account_id', accountId)
            .single()
          if (configError || !config) {
            await upsertTemplateRow(
              supabase,
              buildUpsertRow(accountId, userId, payload, {
                status: 'DRAFT',
                metaTemplateId: null,
                submissionError:
                  'WhatsApp not configured. Connect your WhatsApp Business account in Settings first.',
              }),
            )
            return
          }
          if (!config.waba_id) {
            await upsertTemplateRow(
              supabase,
              buildUpsertRow(accountId, userId, payload, {
                status: 'DRAFT',
                metaTemplateId: null,
                submissionError:
                  'WABA (WhatsApp Business Account) ID missing. Re-connect your account in Settings.',
              }),
            )
            return
          }

          await upsertTemplateRow(
            supabase,
            buildUpsertRow(accountId, userId, payload, {
              status: 'DRAFT',
              metaTemplateId: null,
              submissionError: TEMPLATE_SUBMIT_PROCESSING,
            }),
          )

          const accessToken = decrypt(config.access_token)
          const wabaId = config.waba_id

          await reuseStoredHeaderHandle(supabase, userId, payload)
          await ensureHeaderMediaHandle(payload, accessToken)
          const metaPayload = buildMetaTemplatePayload(payload)
          const meta = await submitMessageTemplate({
            wabaId,
            accessToken,
            payload: metaPayload,
          })
          console.info(
            `[template-submit] Meta accepted ${templateName} in ${Date.now() - started}ms`,
          )
          await upsertTemplateRow(
            supabase,
            buildUpsertRow(accountId, userId, payload, {
              status: normalizeStatus(meta.status),
              metaTemplateId: meta.id,
              submissionError: null,
            }),
          )
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Meta submit failed.'
          console.error(
            `[template-submit] failed for ${templateName}:`,
            message,
          )
          const staleHandle =
            payload.header_handle && /invalid parameter/i.test(message)
          await upsertTemplateRow(
            supabase,
            buildUpsertRow(accountId, userId, {
              ...payload,
              header_handle: staleHandle ? undefined : payload.header_handle,
            }, {
              status: 'DRAFT',
              metaTemplateId: null,
              submissionError: staleHandle
                ? `${message} Try Edit & Retry — we cleared the cached image handle so Meta gets a fresh upload.`
                : message,
            }),
          ).catch((err) => {
            console.error('[template-submit] failed to persist error row:', err)
          })
        }
      })()

      return NextResponse.json(
        {
          accepted: true,
          processing: true,
          name: templateName,
          language: templateLanguage,
        },
        { status: 202 },
      )
    }

    const { data: row, error: upsertErr } = await upsertTemplateRow(
      supabase,
      buildUpsertRow(accountId, userId, payload, {
        status: normalizeStatus(metaStatus),
        metaTemplateId,
        submissionError: null,
      }),
    )

    if (upsertErr) {
      // The submit succeeded on Meta's side but we failed to persist
      // locally. That's a data-drift state — surface the meta_template_id
      // so the user can recover via "Sync from Meta".
      return NextResponse.json(
        {
          error: `Submitted to Meta but failed to save locally: ${upsertErr.message}. Run "Sync from Meta" to recover.`,
          meta_template_id: metaTemplateId,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      template: row,
      dry_run: dryRun,
    })
  } catch (error) {
    // Auth failures map to 401/403. Handled before the generic branch
    // below, which surfaces `error.message` as a 500 — reporting "you
    // aren't an admin" as a template submission failure would send the
    // user chasing the wrong problem.
    if (
      error instanceof UnauthorizedError ||
      error instanceof ForbiddenError
    ) {
      return toErrorResponse(error)
    }
    console.error('Error submitting template:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to submit template.',
      },
      { status: 500 },
    )
  }
}
