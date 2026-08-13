import { describe, expect, it } from 'vitest';
import { normalizeMetaTemplateLanguage } from './template-language';

describe('normalizeMetaTemplateLanguage', () => {
  it('maps Kannada locale codes to kn', () => {
    expect(normalizeMetaTemplateLanguage('kn_IN')).toBe('kn');
    expect(normalizeMetaTemplateLanguage('kn')).toBe('kn');
  });

  it('maps Hindi locale codes to hi', () => {
    expect(normalizeMetaTemplateLanguage('hi_IN')).toBe('hi');
    expect(normalizeMetaTemplateLanguage('hi')).toBe('hi');
  });

  it('passes through codes Meta accepts verbatim', () => {
    expect(normalizeMetaTemplateLanguage('en_US')).toBe('en_US');
    expect(normalizeMetaTemplateLanguage('pt_BR')).toBe('pt_BR');
  });
});
