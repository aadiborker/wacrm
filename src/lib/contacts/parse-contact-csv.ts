/**
 * CSV parsing for the contacts import modal. Shared + unit-tested so
 * tag-column handling stays aligned with phone/name/email/company.
 */

export interface ParsedContactRow {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  /** Tag names from the optional `tags` column (comma/semicolon separated). */
  tagNames: string[];
}

/** Split a CSV cell into unique tag names (case-insensitive de-dupe). */
export function parseTagCell(value: string | undefined): string[] {
  if (!value?.trim()) return [];

  const seen = new Set<string>();
  const names: string[] = [];

  for (const part of value.split(/[,;]/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}

export interface ParseContactCsvResult {
  rows: ParsedContactRow[];
  /** True when the CSV header includes a `tags` column. */
  hasTagsColumn: boolean;
  /** True when the CSV header includes a `company` column. */
  hasCompanyColumn: boolean;
  /** Non-empty data lines after the header (including blank-phone rows). */
  dataLineCount: number;
  /** Rows skipped because the phone cell was empty. */
  blankPhoneCount: number;
  /** Sample names (or line numbers) for blank-phone rows. */
  blankPhoneSamples: string[];
}

const EMPTY_PARSE: ParseContactCsvResult = {
  rows: [],
  hasTagsColumn: false,
  hasCompanyColumn: false,
  dataLineCount: 0,
  blankPhoneCount: 0,
  blankPhoneSamples: [],
};

export function parseContactCsv(text: string): ParseContactCsvResult {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { ...EMPTY_PARSE };
  }

  const headers = lines[0]
    .split(',')
    .map((h) => h.trim().toLowerCase().replace(/["']/g, ''));

  const phoneIdx = headers.indexOf('phone');
  if (phoneIdx === -1) {
    return { ...EMPTY_PARSE };
  }

  const nameIdx = headers.indexOf('name');
  const emailIdx = headers.indexOf('email');
  const companyIdx = headers.indexOf('company');
  const tagsIdx = headers.indexOf('tags');

  const rows: ParsedContactRow[] = [];
  let dataLineCount = 0;
  let blankPhoneCount = 0;
  const blankPhoneSamples: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    dataLineCount++;
    const values = parseCsvLine(line);
    const phone = values[phoneIdx]?.replace(/["']/g, '').trim();
    if (!phone) {
      blankPhoneCount++;
      if (blankPhoneSamples.length < 5) {
        const name =
          nameIdx >= 0
            ? values[nameIdx]?.replace(/["']/g, '').trim()
            : undefined;
        blankPhoneSamples.push(name || `row ${i + 1}`);
      }
      continue;
    }

    rows.push({
      phone,
      name:
        nameIdx >= 0
          ? values[nameIdx]?.replace(/["']/g, '').trim() || undefined
          : undefined,
      email:
        emailIdx >= 0
          ? values[emailIdx]?.replace(/["']/g, '').trim() || undefined
          : undefined,
      company:
        companyIdx >= 0
          ? values[companyIdx]?.replace(/["']/g, '').trim() || undefined
          : undefined,
      tagNames:
        tagsIdx >= 0 ? parseTagCell(values[tagsIdx]?.replace(/["']/g, '')) : [],
    });
  }

  return {
    rows,
    hasTagsColumn: tagsIdx >= 0,
    hasCompanyColumn: companyIdx >= 0,
    dataLineCount,
    blankPhoneCount,
    blankPhoneSamples,
  };
}

/** Simple CSV line parse (handles quoted fields). */
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}
