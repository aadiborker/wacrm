import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// English is the only locale. Keep the catalogue parseable so a bad
// edit to en.json fails CI instead of crashing the app at runtime.

const MESSAGES_DIR = join(process.cwd(), 'messages');

describe('message catalogue', () => {
  it('en.json is valid JSON with at least one top-level key', () => {
    const raw = readFileSync(join(MESSAGES_DIR, 'en.json'), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
  });
});
