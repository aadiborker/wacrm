import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import {
  rangeToIsoBounds,
  tallyByCategory,
  tallyOutboundStatuses,
} from "@/lib/reports/message-volume";

/**
 * GET /api/reports/messages?from=DD/MM/YYYY&to=DD/MM/YYYY
 *
 * Outbound (agent + bot) message counts for the account in the inclusive
 * date range, plus Marketing / Utility / Authentication / Session split.
 * Admin+ only.
 */
export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole("admin");
    const url = new URL(request.url);
    const fromParam = url.searchParams.get("from") ?? "";
    const toParam = url.searchParams.get("to") ?? "";

    const bounds = rangeToIsoBounds(fromParam, toParam);
    if (!bounds.ok) {
      return NextResponse.json(
        { error: bounds.error, code: "bad_request" },
        { status: 400 },
      );
    }

    const { data: templates, error: tplError } = await supabase
      .from("message_templates")
      .select("name, category")
      .eq("account_id", accountId);

    if (tplError) {
      console.error("[reports/messages] templates:", tplError);
      return NextResponse.json(
        { error: "Failed to load templates", code: "internal" },
        { status: 500 },
      );
    }

    // First matching name wins (same name can exist in multiple languages).
    const categoryByName = new Map<string, string>();
    for (const row of templates ?? []) {
      const name = row.name as string;
      if (!categoryByName.has(name) && row.category) {
        categoryByName.set(name, row.category as string);
      }
    }

    const PAGE = 1000;
    const MAX_ROWS = 50_000;
    const rows: Array<{
      status: string | null;
      template_name: string | null;
      category: string | null;
    }> = [];
    let fromIdx = 0;
    let truncated = false;

    while (fromIdx < MAX_ROWS) {
      const toIdx = fromIdx + PAGE - 1;
      const { data, error } = await supabase
        .from("messages")
        .select("status, template_name, conversations!inner(account_id)")
        .eq("conversations.account_id", accountId)
        .in("sender_type", ["agent", "bot"])
        .gte("created_at", bounds.fromIso)
        .lte("created_at", bounds.toIso)
        .order("created_at", { ascending: true })
        .range(fromIdx, toIdx);

      if (error) {
        console.error("[reports/messages] query:", error);
        return NextResponse.json(
          { error: "Failed to load messages", code: "internal" },
          { status: 500 },
        );
      }

      const batch = (data ?? []) as Array<{
        status: string | null;
        template_name: string | null;
      }>;

      for (const row of batch) {
        const name = row.template_name?.trim() || null;
        rows.push({
          status: row.status,
          template_name: name,
          category: name ? (categoryByName.get(name) ?? null) : null,
        });
      }

      if (batch.length < PAGE) break;
      fromIdx += PAGE;
      if (fromIdx >= MAX_ROWS) {
        truncated = true;
        break;
      }
    }

    const counts = tallyOutboundStatuses(rows);
    const by_category = tallyByCategory(rows);

    return NextResponse.json({
      data: {
        from: bounds.from,
        to: bounds.to,
        from_iso: bounds.fromIso,
        to_iso: bounds.toIso,
        truncated,
        counts,
        by_category,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
