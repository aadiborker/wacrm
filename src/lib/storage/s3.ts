import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

/**
 * S3 media storage for account-scoped uploads.
 *
 * Object key shape:
 *   {company-slug}/{bucket}/{timestamp}-{basename}.{ext}
 *
 * Example:
 *   pashupathi-lights/chat-media/1736-photo.jpg
 *
 * `company-slug` comes from accounts.name so Zuno / Pashupathi / Campco
 * land in separate prefixes inside one bucket. Falls back to
 * `account-<uuid>` when the name is empty.
 */

let cachedClient: S3Client | null = null

export function isS3Configured(): boolean {
  return Boolean(
    process.env.S3_BUCKET?.trim() &&
      process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim() &&
      process.env.S3_PUBLIC_BASE_URL?.trim() &&
      process.env.AWS_REGION?.trim(),
  )
}

function requireS3Env() {
  const bucket = process.env.S3_BUCKET?.trim()
  const region = process.env.AWS_REGION?.trim()
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.trim()?.replace(/\/$/, '')

  if (!bucket || !region || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    throw new Error(
      'S3 is not configured. Set S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_PUBLIC_BASE_URL.',
    )
  }

  return { bucket, region, accessKeyId, secretAccessKey, publicBaseUrl }
}

function getS3Client(): S3Client {
  if (cachedClient) return cachedClient
  const { region, accessKeyId, secretAccessKey } = requireS3Env()
  cachedClient = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  })
  return cachedClient
}

/** Turn "Pashupathi Lights" into "pashupathi-lights". */
export function companySlugFromName(name: string, accountId: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug || `account-${accountId}`
}

/** Filename only (no account folder) — used under the company/bucket prefix. */
export function buildMediaFileName(
  fileName: string,
  now: number = Date.now(),
): string {
  const hasExt = /\.[^.]+$/.test(fileName)
  const ext = hasExt ? fileName.split('.').pop()!.toLowerCase() : 'bin'
  const safeBase =
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 40) || 'file'
  return `${now}-${safeBase}.${ext}`
}

export function buildS3ObjectKey(
  companySlug: string,
  bucket: string,
  fileName: string,
  now: number = Date.now(),
): string {
  const safeBucket = bucket.replace(/[^a-zA-Z0-9_-]+/g, '-')
  return `${companySlug}/${safeBucket}/${buildMediaFileName(fileName, now)}`
}

export function publicUrlForKey(key: string): string {
  const { publicBaseUrl } = requireS3Env()
  const encoded = key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `${publicBaseUrl}/${encoded}`
}

export async function putS3Object(params: {
  key: string
  body: Buffer
  contentType: string
}): Promise<{ key: string; publicUrl: string }> {
  const { bucket } = requireS3Env()
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType || 'application/octet-stream',
      // Public-read so Meta can fetch template/chat media by URL.
      // Bucket policy must also allow s3:GetObject for public/* if
      // Block Public Access is relaxed for this use case.
      ACL: undefined,
    }),
  )
  return { key: params.key, publicUrl: publicUrlForKey(params.key) }
}

export async function deleteS3Object(key: string): Promise<void> {
  const { bucket } = requireS3Env()
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  )
}
