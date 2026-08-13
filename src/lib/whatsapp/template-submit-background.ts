import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  editMessageTemplate,
  submitMessageTemplate,
} from '@/lib/whatsapp/meta-api'
import { buildMetaTemplatePayload } from '@/lib/whatsapp/template-components'
import {
  ensureHeaderMediaHandle,
  reuseStoredHeaderHandle,
} from '@/lib/whatsapp/template-header-handle'
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize'
import type { TemplatePayload } from '@/lib/whatsapp/template-validators'

/**
 * Shared upsert payload builder — both the Meta-failure path and the
 * Meta-success path write nearly identical rows; dropping the shared
 * fields here means adding a column later only touches one spot.
 */
export function buildTemplateUpsertRow(
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
    account_id: accountId,
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
    rejection_reason: extras.submissionError ? null : null,
    last_submitted_at: new Date().toISOString(),
    approved_at:
      extras.status === 'APPROVED' ? new Date().toISOString() : null,
  }
}

export async function upsertTemplateRow(
  supabase: SupabaseClient,
  row: ReturnType<typeof buildTemplateUpsertRow>,
) {
  return supabase
    .from('message_templates')
    .upsert(row, { onConflict: 'user_id,name,language' })
    .select()
    .single()
}

export async function backgroundSubmitTemplate(args: {
  supabase: SupabaseClient
  accountId: string
  userId: string
  payload: TemplatePayload
}) {
  const { supabase, accountId, userId, payload } = args
  const started = Date.now()
  const templateName = payload.name

  try {
    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single()
    if (configError || !config) {
      await upsertTemplateRow(
        supabase,
        buildTemplateUpsertRow(accountId, userId, payload, {
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
        buildTemplateUpsertRow(accountId, userId, payload, {
          status: 'DRAFT',
          metaTemplateId: null,
          submissionError:
            'WABA (WhatsApp Business Account) ID missing. Re-connect your account in Settings.',
        }),
      )
      return
    }

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
      buildTemplateUpsertRow(accountId, userId, payload, {
        status: normalizeStatus(meta.status),
        metaTemplateId: meta.id,
        submissionError: null,
      }),
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Meta submit failed.'
    console.error(`[template-submit] failed for ${templateName}:`, message)
    const staleHandle =
      payload.header_handle && /invalid parameter/i.test(message)
    await upsertTemplateRow(
      supabase,
      buildTemplateUpsertRow(accountId, userId, {
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
}

export async function backgroundEditTemplate(args: {
  supabase: SupabaseClient
  accountId: string
  userId: string
  templateId: string
  metaTemplateId: string
  existingHeaderHandle: string | null
  existingHeaderMediaUrl: string | null
  payload: TemplatePayload
}) {
  const {
    supabase,
    accountId,
    templateId,
    metaTemplateId,
    existingHeaderHandle,
    existingHeaderMediaUrl,
    payload,
  } = args
  const started = Date.now()
  const templateName = payload.name

  try {
    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single()
    if (configError || !config) {
      await supabase
        .from('message_templates')
        .update({
          submission_error: 'WhatsApp not configured.',
          last_submitted_at: new Date().toISOString(),
        })
        .eq('id', templateId)
      return
    }

    const accessToken = decrypt(config.access_token)

    if (
      !payload.header_handle &&
      existingHeaderHandle &&
      existingHeaderMediaUrl === payload.header_media_url
    ) {
      payload.header_handle = existingHeaderHandle
    }

    await ensureHeaderMediaHandle(payload, accessToken)
    const metaPayload = buildMetaTemplatePayload(payload)
    await editMessageTemplate({
      metaTemplateId,
      accessToken,
      components: metaPayload.components,
    })
    console.info(
      `[template-edit] Meta accepted ${templateName} in ${Date.now() - started}ms`,
    )

    await supabase
      .from('message_templates')
      .update({
        category: payload.category,
        header_type: payload.header_type ?? null,
        header_content: payload.header_content ?? null,
        header_media_url: payload.header_media_url ?? null,
        header_handle: payload.header_handle ?? null,
        body_text: payload.body_text,
        footer_text: payload.footer_text ?? null,
        buttons: payload.buttons ?? null,
        sample_values: payload.sample_values ?? null,
        status: 'PENDING',
        submission_error: null,
        rejection_reason: null,
        last_submitted_at: new Date().toISOString(),
        approved_at: null,
      })
      .eq('id', templateId)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Meta edit failed.'
    console.error(`[template-edit] failed for ${templateName}:`, message)
    try {
      await supabase
        .from('message_templates')
        .update({
          submission_error: message,
          last_submitted_at: new Date().toISOString(),
        })
        .eq('id', templateId)
    } catch (err) {
      console.error('[template-edit] failed to persist error row:', err)
    }
  }
}
