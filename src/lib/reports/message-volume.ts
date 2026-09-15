/**
 * Reports — outbound message volume for a calendar date range.
 * Dates are interpreted as DD/MM/YYYY (inclusive, UTC day bounds).
 */

export type OutboundMessageCounts = {
  total: number;
  sending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  /** delivered + read — “reached the handset” */
  delivered_or_read: number;
};

export type TemplateCategoryKey =
  | "Marketing"
  | "Utility"
  | "Authentication"
  | "Session"
  | "Unknown";

export type CategoryBucket = {
  total: number;
  delivered_or_read: number;
  failed: number;
};

export type CategoryBreakdown = Record<TemplateCategoryKey, CategoryBucket>;

export const CATEGORY_KEYS: TemplateCategoryKey[] = [
  "Marketing",
  "Utility",
  "Authentication",
  "Session",
  "Unknown",
];

export function emptyOutboundCounts(): OutboundMessageCounts {
  return {
    total: 0,
    sending: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    delivered_or_read: 0,
  };
}

export function emptyCategoryBreakdown(): CategoryBreakdown {
  return {
    Marketing: { total: 0, delivered_or_read: 0, failed: 0 },
    Utility: { total: 0, delivered_or_read: 0, failed: 0 },
    Authentication: { total: 0, delivered_or_read: 0, failed: 0 },
    Session: { total: 0, delivered_or_read: 0, failed: 0 },
    Unknown: { total: 0, delivered_or_read: 0, failed: 0 },
  };
}

/** Map DB / Meta category strings onto our report keys. */
export function normalizeTemplateCategory(
  raw: string | null | undefined,
  hasTemplateName: boolean,
): TemplateCategoryKey {
  if (!hasTemplateName) return "Session";
  const c = (raw ?? "").trim().toLowerCase();
  if (c === "marketing") return "Marketing";
  if (c === "utility") return "Utility";
  if (c === "authentication" || c === "auth") return "Authentication";
  return "Unknown";
}

/** Parse strict DD/MM/YYYY → { y, m, d } or null. */
export function parseDdMmYyyy(
  input: string,
): { year: number; month: number; day: number } | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function formatDdMmYyyy(year: number, month: number, day: number): string {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

/** Inclusive UTC day bounds for a DD/MM/YYYY range. */
export function rangeToIsoBounds(
  fromDdMmYyyy: string,
  toDdMmYyyy: string,
):
  | { ok: true; fromIso: string; toIso: string; from: string; to: string }
  | { ok: false; error: string } {
  const from = parseDdMmYyyy(fromDdMmYyyy);
  const to = parseDdMmYyyy(toDdMmYyyy);
  if (!from || !to) {
    return {
      ok: false,
      error: "Dates must be DD/MM/YYYY (example: 01/09/2026).",
    };
  }
  const fromUtc = Date.UTC(from.year, from.month - 1, from.day, 0, 0, 0, 0);
  const toUtc = Date.UTC(to.year, to.month - 1, to.day, 23, 59, 59, 999);
  if (toUtc < fromUtc) {
    return { ok: false, error: "End date must be on or after the start date." };
  }
  const maxMs = 366 * 24 * 60 * 60 * 1000;
  if (toUtc - fromUtc > maxMs) {
    return { ok: false, error: "Date range cannot exceed 366 days." };
  }
  return {
    ok: true,
    fromIso: new Date(fromUtc).toISOString(),
    toIso: new Date(toUtc).toISOString(),
    from: formatDdMmYyyy(from.year, from.month, from.day),
    to: formatDdMmYyyy(to.year, to.month, to.day),
  };
}

export function tallyOutboundStatuses(
  rows: Array<{ status: string | null }>,
): OutboundMessageCounts {
  const counts = emptyOutboundCounts();
  for (const row of rows) {
    counts.total += 1;
    const s = row.status ?? "";
    if (s === "sending") counts.sending += 1;
    else if (s === "sent") counts.sent += 1;
    else if (s === "delivered") counts.delivered += 1;
    else if (s === "read") counts.read += 1;
    else if (s === "failed") counts.failed += 1;
  }
  counts.delivered_or_read = counts.delivered + counts.read;
  return counts;
}

export function tallyByCategory(
  rows: Array<{
    status: string | null;
    template_name: string | null;
    category: string | null;
  }>,
): CategoryBreakdown {
  const breakdown = emptyCategoryBreakdown();
  for (const row of rows) {
    const key = normalizeTemplateCategory(
      row.category,
      Boolean(row.template_name?.trim()),
    );
    const bucket = breakdown[key];
    bucket.total += 1;
    const s = row.status ?? "";
    if (s === "delivered" || s === "read") bucket.delivered_or_read += 1;
    if (s === "failed") bucket.failed += 1;
  }
  return breakdown;
}
