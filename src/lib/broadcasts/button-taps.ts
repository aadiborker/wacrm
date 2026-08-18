export interface BroadcastButtonTapRow {
  button: string;
  count: number;
}

export function summarizeBroadcastButtonTaps(
  recipients: { tapped_button?: string | null }[],
): BroadcastButtonTapRow[] {
  const counts = new Map<string, number>();

  for (const recipient of recipients) {
    const key = recipient.tapped_button?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([button, count]) => ({ button, count }))
    .sort((a, b) => b.count - a.count || a.button.localeCompare(b.button));
}

export function recipientMatchesTappedButton(
  recipient: { tapped_button?: string | null },
  button: string,
): boolean {
  return (recipient.tapped_button?.trim() ?? '') === button;
}
