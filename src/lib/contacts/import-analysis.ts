/**
 * Pure helpers that bifurcate a contact CSV into totals / duplicates /
 * problem rows so the import UI can show why rows will be skipped.
 */

import { normalizeKey } from './dedupe';
import type { ParsedContactRow } from './parse-contact-csv';

/** Digits-only length below this is treated as unlikely / risky for WhatsApp. */
export const SHORT_PHONE_DIGITS = 10;

export interface DuplicatePhoneSample {
  phone: string;
  count: number;
  names: string[];
}

export interface PhoneSample {
  phone: string;
  name?: string;
}

export interface ImportFileAnalysis {
  /** Parsed rows with a non-empty phone cell. */
  totalRows: number;
  /** Rows with a non-empty name. */
  namesCount: number;
  /** Distinct phones after digit-only normalization. */
  uniquePhones: number;
  /** Extra rows that share a phone already seen earlier in the file. */
  duplicateInFile: number;
  /** Rows whose phone has no digits after normalize. */
  emptyNormalizedPhone: number;
  /** Unique phones with fewer than SHORT_PHONE_DIGITS digits. */
  shortPhone: number;
  shortPhoneSamples: PhoneSample[];
  /** Highest-frequency duplicate phones (for UI samples). */
  duplicateSamples: DuplicatePhoneSample[];
}

export interface ImportResultBreakdown {
  totalRows: number;
  namesCount: number;
  uniquePhones: number;
  imported: number;
  tagsAssigned: number;
  /** Duplicate rows inside the CSV (2nd+ occurrence). */
  skippedInFileDuplicates: number;
  /** Phone already exists on this account. */
  skippedAlreadyExists: number;
  /** No usable digits in the phone cell. */
  skippedEmptyPhone: number;
  /** Blank phone cells dropped while parsing the CSV. */
  skippedBlankPhoneInCsv: number;
  failed: number;
  failedSamples: Array<PhoneSample & { reason: string }>;
  duplicateSamples: DuplicatePhoneSample[];
  shortPhoneSamples: PhoneSample[];
  /** Unknown tags that could not be created (non-admin). */
  skippedTagNames: string[];
}

export function analyzeParsedContactRows(
  rows: ParsedContactRow[],
): ImportFileAnalysis {
  const seen = new Map<string, { phone: string; names: string[]; count: number }>();
  let namesCount = 0;
  let duplicateInFile = 0;
  let emptyNormalizedPhone = 0;
  const shortSamples: PhoneSample[] = [];
  const shortKeys = new Set<string>();

  for (const row of rows) {
    if (row.name?.trim()) namesCount++;

    const key = normalizeKey(row.phone);
    if (!key) {
      emptyNormalizedPhone++;
      continue;
    }

    const entry = seen.get(key);
    if (entry) {
      duplicateInFile++;
      entry.count++;
      const name = row.name?.trim();
      if (name && entry.names.length < 5 && !entry.names.includes(name)) {
        entry.names.push(name);
      }
    } else {
      seen.set(key, {
        phone: row.phone,
        names: row.name?.trim() ? [row.name.trim()] : [],
        count: 1,
      });
      if (key.length < SHORT_PHONE_DIGITS && shortSamples.length < 5) {
        shortKeys.add(key);
        shortSamples.push({
          phone: row.phone,
          name: row.name?.trim() || undefined,
        });
      } else if (key.length < SHORT_PHONE_DIGITS) {
        shortKeys.add(key);
      }
    }
  }

  const duplicateSamples = [...seen.values()]
    .filter((e) => e.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((e) => ({
      phone: e.phone,
      count: e.count,
      names: e.names,
    }));

  return {
    totalRows: rows.length,
    namesCount,
    uniquePhones: seen.size,
    duplicateInFile,
    emptyNormalizedPhone,
    shortPhone: shortKeys.size,
    shortPhoneSamples: shortSamples,
    duplicateSamples,
  };
}
