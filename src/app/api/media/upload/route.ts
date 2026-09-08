import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  buildS3ObjectKey,
  companySlugFromName,
  deleteS3Object,
  isS3Configured,
  putS3Object,
} from '@/lib/storage/s3'
import { MEDIA_MAX_BYTES } from '@/lib/storage/upload-media'

const ALLOWED_BUCKETS = new Set(['chat-media', 'flow-media', 'avatars'])

async function resolveAccount(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileErr || !profile?.account_id) {
    return {
      error: NextResponse.json(
        { error: 'Could not resolve your account.' },
        { status: 400 },
      ),
    }
  }

  const { data: account, error: accountErr } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('id', profile.account_id)
    .maybeSingle()

  if (accountErr || !account) {
    return {
      error: NextResponse.json({ error: 'Account not found.' }, { status: 400 }),
    }
  }

  return {
    userId: user.id,
    accountId: account.id as string,
    accountName: (account.name as string) || '',
  }
}

/**
 * POST /api/media/upload
 * multipart form: file, bucket (chat-media | flow-media | avatars)
 */
export async function POST(request: Request) {
  if (!isS3Configured()) {
    return NextResponse.json(
      {
        error:
          'S3 is not configured on this server. Set S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_PUBLIC_BASE_URL.',
      },
      { status: 503 },
    )
  }

  try {
    const supabase = await createClient()
    const resolved = await resolveAccount(supabase)
    if ('error' in resolved && resolved.error) return resolved.error

    const { accountId, accountName } = resolved as {
      accountId: string
      accountName: string
    }

    const form = await request.formData()
    const file = form.get('file')
    const bucketRaw = form.get('bucket')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    if (typeof bucketRaw !== 'string' || !ALLOWED_BUCKETS.has(bucketRaw)) {
      return NextResponse.json(
        { error: 'bucket must be chat-media, flow-media, or avatars' },
        { status: 400 },
      )
    }
    if (file.size <= 0 || file.size > MEDIA_MAX_BYTES) {
      return NextResponse.json(
        { error: `File must be between 1 byte and ${MEDIA_MAX_BYTES} bytes.` },
        { status: 400 },
      )
    }

    const slug = companySlugFromName(accountName, accountId)
    const key = buildS3ObjectKey(slug, bucketRaw, file.name)
    const body = Buffer.from(await file.arrayBuffer())
    const { publicUrl, key: storedKey } = await putS3Object({
      key,
      body,
      contentType: file.type || 'application/octet-stream',
    })

    return NextResponse.json({
      data: { publicUrl, path: storedKey },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    console.error('[media/upload]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/media/upload
 * JSON body: { path: "company/bucket/file..." }
 * Only deletes keys under the caller's company slug prefix.
 */
export async function DELETE(request: Request) {
  if (!isS3Configured()) {
    return NextResponse.json({ error: 'S3 is not configured.' }, { status: 503 })
  }

  try {
    const supabase = await createClient()
    const resolved = await resolveAccount(supabase)
    if ('error' in resolved && resolved.error) return resolved.error

    const { accountId, accountName } = resolved as {
      accountId: string
      accountName: string
    }

    const body = (await request.json().catch(() => null)) as {
      path?: string
    } | null
    const path = body?.path?.trim()
    if (!path) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 })
    }

    const slug = companySlugFromName(accountName, accountId)
    if (!path.startsWith(`${slug}/`)) {
      return NextResponse.json(
        { error: 'Not allowed to delete objects outside your company folder.' },
        { status: 403 },
      )
    }

    await deleteS3Object(path)
    return NextResponse.json({ data: { ok: true } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed'
    console.error('[media/upload DELETE]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
