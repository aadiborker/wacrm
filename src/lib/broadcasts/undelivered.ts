/** Hours after send before a `sent` row with no delivery is eligible for retry. */
export const DEFAULT_UNDELIVERED_RETRY_HOURS = 24;

export function undeliveredRetryHours(): number {
  const raw = process.env.BROADCAST_UNDELIVERED_RETRY_HOURS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_UNDELIVERED_RETRY_HOURS;
}

export function undeliveredSentBeforeIso(hours = undeliveredRetryHours()): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}
