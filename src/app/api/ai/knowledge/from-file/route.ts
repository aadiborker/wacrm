import { NextResponse } from "next/server";
import {
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { loadEmbeddingsKey } from "@/lib/ai/config";
import { ingestDocument } from "@/lib/ai/knowledge";
import { AiError } from "@/lib/ai/types";
import {
  extractTextFromUpload,
  FileImportError,
} from "@/lib/ai/extract-file";

const CATEGORY_MAX = 64;

/**
 * POST /api/ai/knowledge/from-file  (admin+)
 *
 * multipart/form-data:
 *   file (required) — PDF, DOCX, .md / .markdown, or .txt
 *   category? title?
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole("admin");
    const limit = checkRateLimit(`ai-kb-file:${userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { error: "Expected multipart form data" },
        { status: 400 },
      );
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const categoryRaw =
      typeof form.get("category") === "string"
        ? String(form.get("category")).trim()
        : "";
    const titleOverride =
      typeof form.get("title") === "string"
        ? String(form.get("title")).trim()
        : "";
    const category =
      categoryRaw.length > 0 ? categoryRaw.slice(0, CATEGORY_MAX) : null;

    let extracted;
    try {
      extracted = await extractTextFromUpload(file);
    } catch (err) {
      if (err instanceof FileImportError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    const title = (titleOverride || extracted.title).slice(0, 200);
    const content = extracted.content;

    const { data: doc, error } = await supabase
      .from("ai_knowledge_documents")
      .insert({
        account_id: accountId,
        created_by: userId,
        title,
        content,
        category,
        source_url: extracted.sourceLabel,
      })
      .select("id, title, category, source_url, updated_at")
      .single();
    if (error || !doc) {
      console.error("[ai/knowledge/from-file] insert error:", error);
      return NextResponse.json(
        { error: "Failed to save document" },
        { status: 500 },
      );
    }

    const { key: embeddingsApiKey, corrupt } = await loadEmbeddingsKey(
      supabase,
      accountId,
    );
    try {
      await ingestDocument(
        supabase,
        accountId,
        { embeddingsApiKey },
        doc.id,
        content,
      );
    } catch (err) {
      const message = err instanceof AiError ? err.message : "indexing failed";
      console.error("[ai/knowledge/from-file] ingest error:", err);
      return NextResponse.json({
        success: true,
        document: doc,
        warning: `Saved, but semantic indexing failed (${message}). Lexical search still works; use Reindex to retry.`,
      });
    }

    if (corrupt) {
      return NextResponse.json({
        success: true,
        document: doc,
        warning:
          "Saved with keyword search only — your embeddings key could not be decrypted (check ENCRYPTION_KEY, then re-enter the key).",
      });
    }
    return NextResponse.json({ success: true, document: doc });
  } catch (err) {
    return toErrorResponse(err);
  }
}
