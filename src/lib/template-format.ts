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
 * Meta returns Unix seconds in webhook `entry.time` and ISO strings (or
 * Unix strings) for template `last_updated_time`.
 */
export function metaTimestampToIso(value: unknown): string | null {
  if (value == null) return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      const ms = n > 1e12 ? n : n * 1000;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  return null;
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
