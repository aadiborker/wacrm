/** Meta WhatsApp error codes surfaced in `broadcast_recipients.error_message`. */
export const KNOWN_META_ERROR_CODES = [
  '131026',
  '131049',
  '130472',
] as const;

export type KnownMetaErrorCode = (typeof KNOWN_META_ERROR_CODES)[number];

export interface BroadcastErrorSummaryRow {
  code: string;
  count: number;
}

/** Extract `#131026` style codes from webhook / Meta error strings. */
export function parseMetaErrorCode(
  errorMessage: string | null | undefined,
): string | null {
  if (!errorMessage?.trim()) return null;
  const match = errorMessage.match(/#(\d{5,6})/);
  return match?.[1] ?? null;
}

export function summarizeBroadcastErrors(
  recipients: { status: string; error_message?: string | null }[],
): BroadcastErrorSummaryRow[] {
  const counts = new Map<string, number>();

  for (const recipient of recipients) {
    if (recipient.status !== 'failed') continue;
    const code = parseMetaErrorCode(recipient.error_message) ?? 'other';
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);
}

export function recipientMatchesErrorCode(
  recipient: { status: string; error_message?: string | null },
  code: string,
): boolean {
  if (recipient.status !== 'failed') return false;
  if (code === 'other') {
    return !parseMetaErrorCode(recipient.error_message);
  }
  return parseMetaErrorCode(recipient.error_message) === code;
}
