import { describe, expect, it } from 'vitest';
import { analyzeParsedContactRows } from './import-analysis';

describe('analyzeParsedContactRows', () => {
  it('counts names, unique phones, and in-file duplicates', () => {
    const analysis = analyzeParsedContactRows([
      { phone: '9901392337', name: 'A', tagNames: [] },
      { phone: '9901392337', name: 'A again', tagNames: [] },
      { phone: '9449064354', name: 'B', tagNames: [] },
      { phone: '123', name: 'Short', tagNames: [] },
      { phone: '+++', tagNames: [] },
    ]);

    expect(analysis.totalRows).toBe(5);
    expect(analysis.namesCount).toBe(4);
    expect(analysis.uniquePhones).toBe(3);
    expect(analysis.duplicateInFile).toBe(1);
    expect(analysis.emptyNormalizedPhone).toBe(1);
    expect(analysis.shortPhone).toBe(1);
    expect(analysis.duplicateSamples[0]?.count).toBe(2);
  });
});
