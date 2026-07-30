import { NextResponse } from "next/server";
import {
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { loadEmbeddingsKey } from "@/lib/ai/config";
import { ingestDocument } from "@/lib/ai/knowledge";
import { AiError } from "@/lib/ai/types";
import { importPageFromUrl, UrlImportError } from "@/lib/ai/fetch-url";

const CATEGORY_MAX = 64;

/**
 * POST /api/ai/knowledge/from-url  (admin+)
 *
 * Fetch a public webpage, extract text, save as a knowledge document,
 * and index it. Body: { url, category?, title? }.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole("admin");
    const limit = checkRateLimit(`ai-kb-url:${userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const categoryRaw =
      typeof body?.category === "string" ? body.category.trim() : "";
    const titleOverride =
      typeof body?.title === "string" ? body.title.trim() : "";
    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }
    const category =
      categoryRaw.length > 0 ? categoryRaw.slice(0, CATEGORY_MAX) : null;

    let imported;
    try {
      imported = await importPageFromUrl(url);
    } catch (err) {
      if (err instanceof UrlImportError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    const title = (titleOverride || imported.title).slice(0, 200);
    const content = imported.content;

    const { data: doc, error } = await supabase
      .from("ai_knowledge_documents")
      .insert({
        account_id: accountId,
        created_by: userId,
        title,
        content,
        category,
        source_url: imported.url,
      })
      .select("id, title, category, source_url, updated_at")
      .single();
    if (error || !doc) {
      console.error("[ai/knowledge/from-url] insert error:", error);
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
      console.error("[ai/knowledge/from-url] ingest error:", err);
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
