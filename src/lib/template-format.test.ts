import { describe, expect, it } from 'vitest';
import {
  formatTemplateTime12h,
  metaTimestampToIso,
  resolveTemplateSentIso,
} from './template-format';

describe('formatTemplateTime12h', () => {
  it('formats in 12-hour clock with AM/PM', () => {
    const iso = '2026-08-10T13:18:00+05:30';
    const formatted = formatTemplateTime12h(iso);
    expect(formatted).toMatch(/PM|AM/);
    expect(formatted).toMatch(/\d/);
  });

  it('returns empty string for invalid input', () => {
    expect(formatTemplateTime12h('not-a-date')).toBe('');
  });
});

describe('metaTimestampToIso', () => {
  it('converts Unix seconds', () => {
    expect(metaTimestampToIso(1739321024)).toBe('2025-02-12T00:43:44.000Z');
  });

  it('converts ISO strings', () => {
    expect(metaTimestampToIso('2026-08-10T08:40:00Z')).toBe(
      '2026-08-10T08:40:00.000Z',
    );
  });

  it('returns null for invalid input', () => {
    expect(metaTimestampToIso('not-a-date')).toBeNull();
  });
});

describe('resolveTemplateSentIso', () => {
  it('prefers last_submitted_at over created_at', () => {
    expect(
      resolveTemplateSentIso('2026-08-10T10:00:00Z', '2026-08-09T10:00:00Z'),
    ).toBe('2026-08-10T10:00:00Z');
  });

  it('falls back to created_at', () => {
    expect(resolveTemplateSentIso(null, '2026-08-09T10:00:00Z')).toBe(
      '2026-08-09T10:00:00Z',
    );
  });
});
