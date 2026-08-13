import type { SupabaseClient } from '@supabase/supabase-js'
import { uploadResumableMedia } from '@/lib/whatsapp/meta-api'
import type { TemplatePayload } from '@/lib/whatsapp/template-validators'
import { isDeliverableUrl } from '@/lib/webhooks/ssrf'

/**
 * Meta requires an `example.header_handle` (from the Resumable Upload
 * API) to create/edit a template with an IMAGE or VIDEO header — a plain
 * public URL is not accepted at creation time. This helper turns the
 * template's `header_media_url` (uploaded file or pasted link) into a
 * handle and writes it onto the payload.
 *
 * No-op unless the header is image/video with a URL but no handle yet.
 */

const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const VIDEO_MAX_BYTES = 16 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'] as const
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/3gpp'] as const

type MediaKind = 'image' | 'video'

function mediaKind(
  headerType: TemplatePayload['header_type'],
): MediaKind | null {
  if (headerType === 'image' || headerType === 'video') return headerType
  return null
}

/**
 * @deprecated Prefer {@link ensureHeaderMediaHandle}. Kept as an alias so
 * existing imports/tests keep working.
 */
export async function ensureImageHeaderHandle(
  payload: TemplatePayload,
  accessToken: string,
): Promise<void> {
  return ensureHeaderMediaHandle(payload, accessToken)
}

/**
 * Reuse a Meta header_handle already stored for this (user, name, language)
 * when the media URL is unchanged — skips a slow re-download + re-upload on retry.
 */
export async function reuseStoredHeaderHandle(
  supabase: SupabaseClient,
  userId: string,
  payload: TemplatePayload,
): Promise<boolean> {
  if (payload.header_handle) return true
  const kind = mediaKind(payload.header_type)
  if (!kind || !payload.header_media_url) return false

  const { data } = await supabase
    .from('message_templates')
    .select('header_handle, header_media_url')
    .eq('user_id', userId)
    .eq('name', payload.name)
    .eq('language', payload.language)
    .maybeSingle()

  if (
    data?.header_handle &&
    data.header_media_url === payload.header_media_url
  ) {
    payload.header_handle = data.header_handle
    return true
  }
  return false
}

export async function ensureHeaderMediaHandle(
  payload: TemplatePayload,
  accessToken: string,
): Promise<void> {
  const kind = mediaKind(payload.header_type)
  if (!kind) return
  if (payload.header_handle) {
    console.info(
      `[template-header] reusing existing handle for ${payload.name}`,
    )
    return
  }
  if (!payload.header_media_url) return

  const started = Date.now()

  const appId = process.env.META_APP_ID
  if (!appId) {
    throw new Error(
      `${kind === 'image' ? 'Image' : 'Video'}-header templates need META_APP_ID set (used for Meta’s Resumable Upload). Add it to your environment, or remove the ${kind} header.`,
    )
  }

  const label = kind === 'image' ? 'header image' : 'header video'

  if (!(await isDeliverableUrl(payload.header_media_url))) {
    throw new Error(
      `Could not fetch the ${label} URL. Make sure it is publicly reachable.`,
    )
  }

  let res: Response
  try {
    res = await fetch(payload.header_media_url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(kind === 'video' ? 30_000 : 10_000),
    })
  } catch {
    throw new Error(
      `Could not fetch the ${label} URL. Make sure it is publicly reachable.`,
    )
  }
  if (!res.ok) {
    throw new Error(
      `${kind === 'image' ? 'Header image' : 'Header video'} URL returned ${res.status}. It must be publicly reachable.`,
    )
  }

  const contentType = (res.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase()

  const allowed =
    kind === 'image' ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES
  const maxBytes = kind === 'image' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES

  if (contentType && !(allowed as readonly string[]).includes(contentType)) {
    throw new Error(
      kind === 'image'
        ? `Header image must be JPEG or PNG (got ${contentType}).`
        : `Header video must be MP4 or 3GPP (got ${contentType}).`,
    )
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength === 0) {
    throw new Error(
      kind === 'image' ? 'Header image is empty.' : 'Header video is empty.',
    )
  }
  if (bytes.byteLength > maxBytes) {
    const limitMb = kind === 'image' ? 5 : 16
    throw new Error(
      `Header ${kind} is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB — Meta's limit is ${limitMb} MB.`,
    )
  }

  let mimeType: string
  let fileName: string
  if (kind === 'image') {
    mimeType =
      contentType === 'image/png' ? 'image/png' : 'image/jpeg'
    fileName = mimeType === 'image/png' ? 'header.png' : 'header.jpg'
  } else {
    mimeType =
      contentType === 'video/3gpp' ? 'video/3gpp' : 'video/mp4'
    fileName = mimeType === 'video/3gpp' ? 'header.3gp' : 'header.mp4'
  }

  const { handle } = await uploadResumableMedia({
    appId,
    accessToken,
    fileName,
    mimeType,
    bytes,
  })
  payload.header_handle = handle
  console.info(
    `[template-header] uploaded ${kind} for ${payload.name} (${bytes.byteLength} bytes) in ${Date.now() - started}ms`,
  )
}
