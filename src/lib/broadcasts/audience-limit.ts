/** Upper bound for manual recipient caps in the broadcast wizard. */
export const BROADCAST_RECIPIENT_LIMIT_MAX = 10_000;

/**
 * After audience + exclude resolution, cap to the first N contacts
 * (newest by `created_at`, then `id` — same order as the Contacts page).
 */
export function applyRecipientLimit<T extends { created_at?: string; id: string }>(
  contacts: T[],
  recipientLimit?: number,
): T[] {
  if (
    recipientLimit == null ||
    recipientLimit <= 0 ||
    contacts.length <= recipientLimit
  ) {
    return contacts;
  }
  const sorted = [...contacts].sort((a, b) => {
    const ac = a.created_at ?? '';
    const bc = b.created_at ?? '';
    if (ac !== bc) return bc.localeCompare(ac);
    return b.id.localeCompare(a.id);
  });
  return sorted.slice(0, recipientLimit);
}

/** Shrink a pre-counted audience size when a cap is configured. */
export function cappedAudienceCount(
  count: number,
  recipientLimit?: number,
): number {
  if (recipientLimit == null || recipientLimit <= 0) return count;
  return Math.min(count, recipientLimit);
}
