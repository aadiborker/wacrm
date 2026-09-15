import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import {
  rangeToIsoBounds,
  tallyOutboundStatuses,
} from "@/lib/reports/message-volume";

/**
 * GET /api/reports/messages?from=DD/MM/YYYY&to=DD/MM/YYYY
 *
 * Outbound (agent + bot) message counts for the account in the inclusive
 * date range. Admin+ only.
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

    // Page through status rows — accounts can send a lot; 5k pages keep
    // memory bounded while covering typical report windows.
    const PAGE = 1000;
    const MAX_ROWS = 50_000;
    const statuses: Array<{ status: string | null }> = [];
    let fromIdx = 0;
    let truncated = false;

    while (fromIdx < MAX_ROWS) {
      const toIdx = fromIdx + PAGE - 1;
      const { data, error } = await supabase
        .from("messages")
        .select("status, conversations!inner(account_id)")
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

      const rows = (data ?? []) as Array<{ status: string | null }>;
      statuses.push(...rows);
      if (rows.length < PAGE) break;
      fromIdx += PAGE;
      if (fromIdx >= MAX_ROWS) {
        truncated = true;
        break;
      }
    }

    const counts = tallyOutboundStatuses(statuses);

    return NextResponse.json({
      data: {
        from: bounds.from,
        to: bounds.to,
        from_iso: bounds.fromIso,
        to_iso: bounds.toIso,
        truncated,
        counts,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
