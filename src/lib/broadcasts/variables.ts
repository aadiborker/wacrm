import type { SupabaseClient } from '@supabase/supabase-js';

import type { Contact } from '@/types';

export type VariableMapping =
  | { type: 'static'; value: string }
  | { type: 'field'; value: string }
  | { type: 'custom_field'; value: string };

/** contactId → (customFieldId → value). */
export type CustomValueIndex = Map<string, Map<string, string>>;

/**
 * Per-contact resolution of template placeholders. Static and built-in
 * fields resolve synchronously; custom fields read from a pre-built index.
 */
export function resolveVariables(
  variables: Record<string, VariableMapping>,
  contact: Contact,
  customValues?: Map<string, string>,
): string[] {
  const keys = Object.keys(variables).sort((a, b) => {
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return a.localeCompare(b);
  });

  return keys.map((key) => {
    const v = variables[key];
    if (v.type === 'static') return v.value;

    if (v.type === 'field') {
      const fieldMap: Record<string, string | undefined> = {
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        company: contact.company,
      };
      return fieldMap[v.value] ?? '';
    }

    return customValues?.get(v.value) ?? '';
  });
}

/** Bulk-fetch contact_custom_values for a set of contacts. */
export async function fetchCustomValueIndex(
  supabase: SupabaseClient,
  contactIds: string[],
): Promise<CustomValueIndex> {
  const index: CustomValueIndex = new Map();
  if (contactIds.length === 0) return index;

  const PAGE = 500;
  for (let i = 0; i < contactIds.length; i += PAGE) {
    const slice = contactIds.slice(i, i + PAGE);
    const { data } = await supabase
      .from('contact_custom_values')
      .select('contact_id, custom_field_id, value')
      .in('contact_id', slice);

    for (const row of data ?? []) {
      const bucket = index.get(row.contact_id) ?? new Map<string, string>();
      bucket.set(row.custom_field_id, row.value ?? '');
      index.set(row.contact_id, bucket);
    }
  }
  return index;
}

export function parseVariableMappings(
  raw: Record<string, unknown> | null | undefined,
): Record<string, VariableMapping> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, VariableMapping> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!val || typeof val !== 'object') continue;
    const v = val as { type?: string; value?: string };
    if (
      (v.type === 'static' ||
        v.type === 'field' ||
        v.type === 'custom_field') &&
      typeof v.value === 'string'
    ) {
      out[key] = { type: v.type, value: v.value };
    }
  }
  return out;
}

export function parseHeaderMediaUrl(
  audienceFilter: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!audienceFilter || typeof audienceFilter !== 'object') return undefined;
  const url = audienceFilter.headerMediaUrl;
  return typeof url === 'string' && url.trim() ? url.trim() : undefined;
}
