import { createClient } from "@/lib/supabase/client";

/**
 * Shared media-upload helper for account-scoped media.
 *
 * When S3 is configured on the server (`S3_BUCKET` + AWS creds +
 * `S3_PUBLIC_BASE_URL`), uploads go through `POST /api/media/upload` and
 * land under:
 *
 *   {company-slug}/{bucket}/{timestamp}-{basename}.{ext}
 *
 * e.g. `pashupathi-lights/chat-media/1736-photo.jpg`
 *
 * Otherwise we fall back to Supabase Storage with the path convention
 * from migration 020/023:
 *
 *   <bucket>/account-<account_id>/<timestamp>-<basename>.<ext>
 */

/** 16 MB — matches the `file_size_limit` on both buckets (migrations 016/020/023). */
export const MEDIA_MAX_BYTES = 16 * 1024 * 1024;

/**
 * Per-kind upload ceilings that mirror Meta's WhatsApp Cloud API caps so
 * a file that the bucket would accept (≤16 MB) but Meta would reject is
 * caught client-side BEFORE upload — otherwise it lands in storage as an
 * orphan and the send fails with a confusing 400. Images are Meta's
 * tightest cap at 5 MB; documents are held at the 16 MB bucket limit
 * (Meta allows 100 MB, but the bucket — and shared-hosting upload UX —
 * caps lower).
 */
export const MEDIA_MAX_BYTES_BY_KIND = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 16 * 1024 * 1024,
} as const;

/**
 * Build the account-scoped object path for an upload. Pure + exported so
 * it can be unit-tested without a Supabase client.
 *
 * - `basename` is stripped of its extension, lower-cased non-safe chars
 *   are collapsed to `_`, and it's capped at 40 chars (falls back to
 *   "file" when empty).
 * - The timestamp + the original name keep collisions between two
 *   concurrent uploads astronomically unlikely.
 */
export function buildMediaPath(
  accountId: string,
  fileName: string,
  now: number = Date.now(),
): string {
  // Only treat the trailing segment as an extension when there's a real
  // one — a bare name like "README" has no extension and falls back to
  // "bin" rather than becoming "readme".
  const hasExt = /\.[^.]+$/.test(fileName);
  const ext = hasExt ? fileName.split(".").pop()!.toLowerCase() : "bin";
  const safeBase =
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 40) || "file";
  return `account-${accountId}/${now}-${safeBase}.${ext}`;
}

export interface UploadAccountMediaResult {
  /** Public URL Meta can fetch at send time. */
  publicUrl: string;
  /** Storage object path (account-scoped). */
  path: string;
}

async function uploadViaS3Api(
  bucket: string,
  file: File,
): Promise<UploadAccountMediaResult | "not_configured"> {
  const form = new FormData();
  form.append("file", file);
  form.append("bucket", bucket);

  const res = await fetch("/api/media/upload", {
    method: "POST",
    body: form,
  });

  if (res.status === 503) return "not_configured";

  const json = (await res.json().catch(() => null)) as {
    data?: { publicUrl?: string; path?: string };
    error?: string;
  } | null;

  if (!res.ok) {
    throw new Error(json?.error || `Upload failed (${res.status})`);
  }
  if (!json?.data?.publicUrl || !json.data.path) {
    throw new Error("Upload failed: empty response");
  }
  return { publicUrl: json.data.publicUrl, path: json.data.path };
}

async function uploadViaSupabase(
  bucket: string,
  file: File,
): Promise<UploadAccountMediaResult> {
  const supabase = createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new Error("Not signed in.");
  }

  // Resolve account_id so the path is account-scoped (matches the
  // bucket's RLS write policy from migration 020/023). User-scoped
  // paths would be rejected.
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileErr || !profile?.account_id) {
    throw new Error("Could not resolve your account.");
  }

  const path = buildMediaPath(profile.account_id as string, file.name);
  const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (upErr) throw new Error(upErr.message);

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);

  return { publicUrl, path };
}

/**
 * Upload a file to an account-scoped Storage bucket and return its public
 * URL. Throws with a user-facing message on auth / account-resolution /
 * upload failure — callers surface it via a toast.
 *
 * Prefers S3 when the server has AWS env configured; otherwise Supabase
 * Storage. Size validation is the caller's responsibility (limits can
 * differ per feature); `MEDIA_MAX_BYTES` is exported for the common case.
 */
export async function uploadAccountMedia(
  bucket: string,
  file: File,
): Promise<UploadAccountMediaResult> {
  const s3 = await uploadViaS3Api(bucket, file);
  if (s3 !== "not_configured") return s3;
  return uploadViaSupabase(bucket, file);
}

/**
 * Delete a previously-uploaded object. Used to GC media that was staged
 * (uploaded) but never sent — a cancelled draft or a failed Meta send —
 * so abandoned attachments don't accumulate in the public bucket.
 *
 * Best-effort: callers fire-and-forget and swallow errors (a missed
 * delete is a storage nit, not something to surface to the user).
 */
export async function deleteAccountMedia(
  bucket: string,
  path: string,
): Promise<void> {
  // S3 paths look like "company/bucket/file"; Supabase paths like
  // "account-uuid/file". Prefer the API when the path has a company
  // prefix (contains the bucket segment).
  if (path.includes(`/${bucket}/`) || path.split("/").length >= 3) {
    const res = await fetch("/api/media/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (res.status === 503) {
      // S3 not configured — fall through to Supabase.
    } else if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(json?.error || `Delete failed (${res.status})`);
    } else {
      return;
    }
  }

  const supabase = createClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw new Error(error.message);
}
