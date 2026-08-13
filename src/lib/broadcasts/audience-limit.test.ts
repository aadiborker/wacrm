import { describe, expect, it } from 'vitest';
import {
  applyRecipientLimit,
  cappedAudienceCount,
} from '@/lib/broadcasts/audience-limit';

describe('applyRecipientLimit', () => {
  const contacts = [
    { id: 'c', created_at: '2024-03-01T00:00:00Z' },
    { id: 'a', created_at: '2024-01-01T00:00:00Z' },
    { id: 'b', created_at: '2024-02-01T00:00:00Z' },
  ];

  it('returns all when no limit', () => {
    expect(applyRecipientLimit(contacts)).toHaveLength(3);
  });

  it('returns oldest contacts first up to the limit', () => {
    const limited = applyRecipientLimit(contacts, 2);
    expect(limited.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    applyRecipientLimit(contacts, 1);
    expect(contacts.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('cappedAudienceCount', () => {
  it('caps the displayed count', () => {
    expect(cappedAudienceCount(1200, 500)).toBe(500);
  });

  it('returns full count when no cap', () => {
    expect(cappedAudienceCount(1200)).toBe(1200);
  });
});
