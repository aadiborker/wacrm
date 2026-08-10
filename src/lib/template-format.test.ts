import { describe, expect, it } from 'vitest';
import { formatTemplateTime12h } from './template-format';

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
