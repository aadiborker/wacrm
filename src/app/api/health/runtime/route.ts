import { NextResponse } from 'next/server'

/**
 * Lightweight runtime probe for deploy healthchecks.
 * Does not expose secret values — only whether required env is loaded.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    meta_app_id_configured: Boolean(process.env.META_APP_ID?.trim()),
  })
}
