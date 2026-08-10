/** 12-hour clock for template sent / approved timestamps in Settings. */
export function formatTemplateTime12h(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const raw = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  // Normalise "1:18 pm" → "1:18 PM" for a consistent label in the UI.
  return raw.replace(/\s(am|pm)$/i, (_, meridiem: string) =>
    ` ${meridiem.toUpperCase()}`,
  );
}

/**
 * When Meta submission time is missing (template synced from Meta only),
 * fall back to when the row was first stored in ReplyFlow.
 */
export function resolveTemplateSentIso(
  lastSubmittedAt?: string | null,
  createdAt?: string | null,
): string | null {
  if (lastSubmittedAt) return lastSubmittedAt;
  if (createdAt) return createdAt;
  return null;
}
