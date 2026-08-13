import { after } from 'next/server'
import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import {
  validateTemplatePayload,
  type TemplatePayload,
} from '@/lib/whatsapp/template-validators'
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize'
import { TEMPLATE_SUBMIT_PROCESSING } from '@/lib/whatsapp/template-submit-processing'
import { normalizeMetaTemplateLanguage } from '@/lib/whatsapp/template-language'
import {
  backgroundSubmitTemplate,
  buildTemplateUpsertRow,
  upsertTemplateRow,
} from '@/lib/whatsapp/template-submit-background'

/** Image headers download from Supabase + upload to Meta — can exceed default limits. */
export const maxDuration = 120

/**
 * Submit a template to Meta for approval AND persist it locally.
 *
 * Auth → validate → mark PROCESSING → 202 → `after()` runs Meta work.
 *
 * When WHATSAPP_TEMPLATES_DRY_RUN=true, we skip the network call and
 * insert a row with a synthetic `dry-run-<uuid>` meta_template_id so
 * CI / local dev can exercise the full UI without a real Meta App.
 */
export async function POST(request: Request) {
  try {
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

      // Mark processing before 202 so the UI poll does not treat a stale
      // APPROVED row (meta edit) or old submission_error as finished.
      const { error: markErr } = await upsertTemplateRow(
        supabase,
        buildTemplateUpsertRow(accountId, userId, payload, {
          status: 'DRAFT',
          metaTemplateId: null,
          submissionError: TEMPLATE_SUBMIT_PROCESSING,
        }),
      )
      if (markErr) {
        return NextResponse.json(
          { error: `Failed to queue submit: ${markErr.message}` },
          { status: 500 },
        )
      }

      after(() =>
        backgroundSubmitTemplate({
          supabase,
          accountId,
          userId,
          payload,
        }),
      )

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
      buildTemplateUpsertRow(accountId, userId, payload, {
        status: normalizeStatus(metaStatus),
        metaTemplateId,
        submissionError: null,
      }),
    )

    if (upsertErr) {
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
