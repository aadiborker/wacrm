import { describe, expect, it } from 'vitest';
import {
  parseMetaErrorCode,
  recipientMatchesErrorCode,
  summarizeBroadcastErrors,
} from '@/lib/broadcasts/error-summary';

describe('parseMetaErrorCode', () => {
  it('extracts Meta numeric codes', () => {
    expect(
      parseMetaErrorCode(
        '#131026 — Message undeliverable — Message Undeliverable.',
      ),
    ).toBe('131026');
  });

  it('returns null when no code present', () => {
    expect(parseMetaErrorCode('No phone number on contact')).toBeNull();
  });
});

describe('summarizeBroadcastErrors', () => {
  it('groups failed recipients by code', () => {
    const rows = summarizeBroadcastErrors([
      {
        status: 'failed',
        error_message: '#131026 — Message undeliverable',
      },
      {
        status: 'failed',
        error_message: '#131049 — healthy ecosystem',
      },
      { status: 'delivered', error_message: null },
      {
        status: 'failed',
        error_message: '#131026 — Message undeliverable',
      },
    ]);
    expect(rows).toEqual([
      { code: '131026', count: 2 },
      { code: '131049', count: 1 },
    ]);
  });
});

describe('recipientMatchesErrorCode', () => {
  it('matches other bucket when no hash code', () => {
    expect(
      recipientMatchesErrorCode(
        { status: 'failed', error_message: 'Meta API error' },
        'other',
      ),
    ).toBe(true);
  });
});
