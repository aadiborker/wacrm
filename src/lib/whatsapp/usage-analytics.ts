/**
 * Meta WhatsApp conversation + pricing analytics (WABA-scoped).
 * Uses the same Cloud API token as messaging — not BSP-only.
 */

const META_API_VERSION = "v21.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
const META_ANALYTICS_TIMEOUT_MS = 20_000;

export type UsageAnalyticsErrorCode =
  | "whatsapp_not_configured"
  | "token_decrypt_failed"
  | "meta_permission"
  | "meta_upstream"
  | "empty";

export class UsageAnalyticsError extends Error {
  readonly code: UsageAnalyticsErrorCode;
  readonly details?: { waba_id?: string };
  constructor(
    code: UsageAnalyticsErrorCode,
    message: string,
    details?: UsageAnalyticsError["details"],
  ) {
    super(message);
    this.name = "UsageAnalyticsError";
    this.code = code;
    this.details = details;
  }
}

export interface UsageAnalyticsTotals {
  conversations: number | null;
  conversation_cost: number | null;
  message_volume: number | null;
  pricing_cost: number | null;
}

export interface UsageAnalyticsResult {
  days: number;
  start: number;
  end: number;
  fetched_at: string;
  waba_id: string;
  totals: UsageAnalyticsTotals;
  conversation_points: number;
  pricing_points: number;
}

interface MetaErrorBody {
  error?: { message?: string; code?: number };
}

function unixRangeForDays(days: number): { start: number; end: number } {
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 24 * 60 * 60;
  return { start, end };
}

export function sumNumericField(
  points: Array<Record<string, unknown>>,
  key: string,
): number | null {
  let sum = 0;
  let seen = false;
  for (const p of points) {
    const raw = p[key];
    const n =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number(raw)
          : NaN;
    if (!Number.isFinite(n)) continue;
    sum += n;
    seen = true;
  }
  return seen ? sum : null;
}

/** Flatten Meta analytics `data[].data_points[]` into one list. */
export function flattenAnalyticsDataPoints(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as { data?: unknown };
  const rows = Array.isArray(root.data) ? root.data : [];
  const out: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const points = (row as { data_points?: unknown }).data_points;
    if (!Array.isArray(points)) continue;
    for (const p of points) {
      if (p && typeof p === "object") out.push(p as Record<string, unknown>);
    }
  }
  return out;
}

export function buildConversationAnalyticsField(
  start: number,
  end: number,
): string {
  return (
    `conversation_analytics.start(${start}).end(${end})` +
    `.granularity(DAILY).metric_types([CONVERSATION,COST])`
  );
}

export function buildPricingAnalyticsField(start: number, end: number): string {
  return (
    `pricing_analytics.start(${start}).end(${end})` +
    `.granularity(DAILY).metric_types([COST,VOLUME])`
  );
}

async function metaGetJson(
  url: string,
  accessToken: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(META_ANALYTICS_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/aborted|timeout/i.test(message) || (err instanceof Error && /Timeout|Abort/.test(err.name))) {
      throw new UsageAnalyticsError(
        "meta_upstream",
        "Meta analytics request timed out. Try again.",
      );
    }
    throw new UsageAnalyticsError(
      "meta_upstream",
      `Could not reach Meta: ${message}`,
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const err = (body as MetaErrorBody | null)?.error;
    const message =
      err?.message || `Meta request failed with HTTP ${response.status}`;
    const permission =
      response.status === 401 ||
      response.status === 403 ||
      /permission|oauth|#10|#200|not.*authorized/i.test(message);
    throw new UsageAnalyticsError(
      permission ? "meta_permission" : "meta_upstream",
      message,
    );
  }

  return body;
}

export async function fetchWhatsAppUsageAnalytics(args: {
  accessToken: string;
  wabaId: string;
  days?: number;
}): Promise<UsageAnalyticsResult> {
  const days = Math.min(90, Math.max(1, args.days ?? 7));
  const { start, end } = unixRangeForDays(days);
  const { accessToken, wabaId } = args;

  const fields = [
    buildConversationAnalyticsField(start, end),
    buildPricingAnalyticsField(start, end),
  ].join(",");

  const url =
    `${META_API_BASE}/${encodeURIComponent(wabaId)}` +
    `?fields=${encodeURIComponent(fields)}`;

  const body = (await metaGetJson(url, accessToken)) as {
    conversation_analytics?: unknown;
    pricing_analytics?: unknown;
  };

  const conversationPoints = flattenAnalyticsDataPoints(
    body.conversation_analytics,
  );
  const pricingPoints = flattenAnalyticsDataPoints(body.pricing_analytics);

  const totals: UsageAnalyticsTotals = {
    conversations: sumNumericField(conversationPoints, "conversation"),
    conversation_cost: sumNumericField(conversationPoints, "cost"),
    message_volume: sumNumericField(pricingPoints, "volume"),
    pricing_cost: sumNumericField(pricingPoints, "cost"),
  };

  const anyData =
    conversationPoints.length > 0 ||
    pricingPoints.length > 0 ||
    Object.values(totals).some((v) => v != null);

  if (!anyData) {
    throw new UsageAnalyticsError(
      "empty",
      `Meta returned no conversation/pricing analytics for WABA ${wabaId} in the last ${days} days.`,
      { waba_id: wabaId },
    );
  }

  return {
    days,
    start,
    end,
    fetched_at: new Date().toISOString(),
    waba_id: wabaId,
    totals,
    conversation_points: conversationPoints.length,
    pricing_points: pricingPoints.length,
  };
}
