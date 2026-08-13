'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Contact, CustomField, MessageTemplate } from '@/types';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Eye, ImageIcon, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VariableMapping } from '@/lib/broadcasts/variables';

const MEDIA_HEADER_TYPES = ['image', 'video', 'document'] as const;
type MediaHeaderType = (typeof MEDIA_HEADER_TYPES)[number];

const contactFields = [
  { value: 'name', labelKey: 'name' },
  { value: 'phone', labelKey: 'phone' },
  { value: 'email', labelKey: 'email' },
];

const SAMPLE_CONTACT: Contact = {
  id: 'sample',
  user_id: '',
  account_id: '',
  name: 'John Doe',
  phone: '+1234567890',
  email: 'john@example.com',
  company: 'Acme Corp',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function isMediaHeaderType(value: unknown): value is MediaHeaderType {
  return MEDIA_HEADER_TYPES.includes(value as MediaHeaderType);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function getBodyPlaceholders(bodyText: string): string[] {
  const matches = bodyText.match(/\{\{(\d+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches)].sort();
}

export function computeTemplatePersonalizeValidation(
  template: MessageTemplate,
  variables: Record<string, VariableMapping>,
  headerMediaUrl: string,
): {
  unmappedKeys: string[];
  headerMediaError: 'missing' | 'invalid' | null;
  canProceed: boolean;
} {
  const placeholders = getBodyPlaceholders(template.body_text);
  const unmappedKeys: string[] = [];
  for (const placeholder of placeholders) {
    const key = placeholder.replace(/^\{\{|\}\}$/g, '');
    const mapping = variables[key];
    if (!mapping?.value?.trim()) unmappedKeys.push(placeholder);
  }

  const mediaHeaderType = isMediaHeaderType(template.header_type)
    ? template.header_type
    : null;
  let headerMediaError: 'missing' | 'invalid' | null = null;
  if (mediaHeaderType) {
    const value = headerMediaUrl.trim();
    if (!value) headerMediaError = 'missing';
    else if (!isValidHttpUrl(value)) headerMediaError = 'invalid';
  }

  return {
    unmappedKeys,
    headerMediaError,
    canProceed: unmappedKeys.length === 0 && headerMediaError === null,
  };
}

export interface TemplatePersonalizeFormProps {
  template: MessageTemplate;
  variables: Record<string, VariableMapping>;
  onVariablesChange: (variables: Record<string, VariableMapping>) => void;
  headerMediaUrl: string;
  onHeaderMediaUrlChange: (url: string) => void;
  /** Contact used for preview + field/custom-field resolution preview. */
  previewContact?: Contact | null;
  showPreview?: boolean;
}

export function TemplatePersonalizeForm({
  template,
  variables,
  onVariablesChange,
  headerMediaUrl,
  onHeaderMediaUrlChange,
  previewContact,
  showPreview = true,
}: TemplatePersonalizeFormProps) {
  const t = useTranslations('Broadcasts.wizard');
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [fallbackContact, setFallbackContact] = useState<Contact | null>(null);
  const [fallbackCustomValues, setFallbackCustomValues] = useState<
    Map<string, string>
  >(new Map());
  const [contactCustomValues, setContactCustomValues] = useState<
    Map<string, string>
  >(new Map());
  const [loadingPreview, setLoadingPreview] = useState(!previewContact);

  const placeholders = useMemo(
    () => getBodyPlaceholders(template.body_text),
    [template.body_text],
  );

  const mediaHeaderType = isMediaHeaderType(template.header_type)
    ? template.header_type
    : null;

  useEffect(() => {
    if (mediaHeaderType && !headerMediaUrl && template.header_media_url) {
      onHeaderMediaUrlChange(template.header_media_url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaHeaderType, template.header_media_url]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: fields } = await supabase
        .from('custom_fields')
        .select('*')
        .order('field_name');
      if (!cancelled) {
        setCustomFields(fields ?? []);
        setLoadingFields(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (previewContact) {
      setLoadingPreview(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: contact } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setFallbackContact(contact ?? null);
      if (contact) {
        const { data: customVals } = await supabase
          .from('contact_custom_values')
          .select('custom_field_id, value')
          .eq('contact_id', contact.id);
        if (!cancelled) {
          const map = new Map<string, string>();
          for (const row of customVals ?? []) {
            map.set(row.custom_field_id, row.value ?? '');
          }
          setFallbackCustomValues(map);
        }
      }
      setLoadingPreview(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [previewContact]);

  useEffect(() => {
    if (!previewContact?.id) {
      setContactCustomValues(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('contact_custom_values')
        .select('custom_field_id, value')
        .eq('contact_id', previewContact.id);
      if (cancelled) return;
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        map.set(row.custom_field_id, row.value ?? '');
      }
      setContactCustomValues(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [previewContact?.id]);

  const { unmappedKeys, headerMediaError } = computeTemplatePersonalizeValidation(
    template,
    variables,
    headerMediaUrl,
  );

  function updateVariable(key: string, patch: Partial<VariableMapping>) {
    const current = variables[key] ?? { type: 'static' as const, value: '' };
    onVariablesChange({
      ...variables,
      [key]: { ...current, ...patch },
    });
  }

  const previewContactResolved = previewContact ?? fallbackContact ?? SAMPLE_CONTACT;
  const previewCustomValues = previewContact
    ? contactCustomValues
    : fallbackCustomValues;

  const previewText = useMemo(() => {
    let text = template.body_text;
    for (const placeholder of placeholders) {
      const key = placeholder.replace(/^\{\{|\}\}$/g, '');
      const mapping = variables[key];
      let replacement = placeholder;

      if (mapping) {
        if (mapping.type === 'static' && mapping.value) {
          replacement = mapping.value;
        } else if (mapping.type === 'field' && mapping.value) {
          const fieldMap: Record<string, string | undefined> = {
            name: previewContactResolved.name,
            phone: previewContactResolved.phone,
            email: previewContactResolved.email,
            company: previewContactResolved.company,
          };
          replacement = fieldMap[mapping.value] ?? placeholder;
        } else if (mapping.type === 'custom_field' && mapping.value) {
          replacement = previewCustomValues.get(mapping.value) || placeholder;
        }
      }
      text = text.replaceAll(placeholder, replacement);
    }
    return text;
  }, [
    template.body_text,
    variables,
    placeholders,
    previewContactResolved,
    previewCustomValues,
  ]);

  const previewLabel =
    previewContactResolved.name ||
    previewContactResolved.phone ||
    t('personalize.previewSample');

  return (
    <div className="space-y-4">
      {mediaHeaderType && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">
              {t('personalize.headerImage')}
            </p>
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium uppercase text-primary">
              {mediaHeaderType}
            </span>
          </div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t('personalize.imageUrl')}
          </label>
          <Input
            type="url"
            value={headerMediaUrl}
            onChange={(e) => onHeaderMediaUrlChange(e.target.value)}
            placeholder={t('personalize.imageUrlPlaceholder')}
            className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t('personalize.headerImageDesc')}
          </p>
          {mediaHeaderType === 'image' &&
            headerMediaError === null &&
            headerMediaUrl.trim() && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headerMediaUrl.trim()}
                alt="Header preview"
                className="mt-3 max-h-40 rounded-lg border border-border object-contain"
              />
            )}
          {headerMediaError && (
            <p className="mt-1.5 text-xs text-amber-300">
              {headerMediaError === 'missing'
                ? 'A media URL is required to send this template.'
                : 'Enter a valid http(s) URL.'}
            </p>
          )}
        </div>
      )}

      {placeholders.length > 0 && (
        <div className="space-y-4">
          {placeholders.map((placeholder) => {
            const key = placeholder.replace(/^\{\{|\}\}$/g, '');
            const mapping = variables[key] ?? { type: 'static', value: '' };

            return (
              <div
                key={placeholder}
                className="rounded-xl border border-border bg-card/50 p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-mono font-medium text-primary">
                    {placeholder}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {t('personalize.type')}
                    </label>
                    <Select
                      value={mapping.type}
                      onValueChange={(val) =>
                        updateVariable(key, {
                          type: val as VariableMapping['type'],
                          value: '',
                        })
                      }
                    >
                      <SelectTrigger className="w-full border-border bg-muted text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border bg-popover">
                        <SelectItem value="static">
                          {t('personalize.typeStatic')}
                        </SelectItem>
                        <SelectItem value="field">
                          {t('personalize.typeContact')}
                        </SelectItem>
                        <SelectItem value="custom_field">
                          {t('personalize.typeCustom')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {mapping.type === 'static'
                        ? t('personalize.staticValue')
                        : t('personalize.contactField')}
                    </label>
                    {mapping.type === 'static' ? (
                      <Input
                        value={mapping.value}
                        onChange={(e) =>
                          updateVariable(key, { value: e.target.value })
                        }
                        placeholder="Enter value..."
                        className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                      />
                    ) : mapping.type === 'field' ? (
                      <Select
                        value={mapping.value || undefined}
                        onValueChange={(val) =>
                          updateVariable(key, { value: val || '' })
                        }
                      >
                        <SelectTrigger className="w-full border-border bg-muted text-foreground">
                          <SelectValue
                            placeholder={t('personalize.selectContactField')}
                          />
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover">
                          {contactFields.map((field) => (
                            <SelectItem key={field.value} value={field.value}>
                              {t(`personalize.fieldMap.${field.labelKey}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={mapping.value || undefined}
                        onValueChange={(val) =>
                          updateVariable(key, { value: val || '' })
                        }
                      >
                        <SelectTrigger className="w-full border-border bg-muted text-foreground">
                          <SelectValue
                            placeholder={
                              loadingFields
                                ? 'Loading…'
                                : customFields.length === 0
                                  ? 'No custom fields'
                                  : 'Select custom field…'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover">
                          {customFields.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.field_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showPreview && (placeholders.length > 0 || mediaHeaderType) && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">
              {t('personalize.preview')}
            </p>
            <span className="text-xs text-muted-foreground">({previewLabel})</span>
            {loadingPreview && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            )}
          </div>
          <div className="rounded-lg bg-[#0e1a12] p-3">
            <div className="ml-auto max-w-[85%] rounded-lg bg-primary/30 px-3 py-2 shadow-sm">
              <p className="whitespace-pre-wrap text-sm text-primary">
                {previewText}
              </p>
            </div>
          </div>
        </div>
      )}

      {unmappedKeys.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Map every placeholder before continuing — still missing{' '}
          <span className="font-mono font-semibold">
            {unmappedKeys.join(', ')}
          </span>
          . Otherwise those placeholders will ship to Meta as empty strings.
        </div>
      )}
    </div>
  );
}

export function buildInitialVariableMappings(
  template: MessageTemplate,
): Record<string, VariableMapping> {
  const placeholders = getBodyPlaceholders(template.body_text);
  const out: Record<string, VariableMapping> = {};
  for (const placeholder of placeholders) {
    const key = placeholder.replace(/^\{\{|\}\}$/g, '');
    out[key] = { type: 'static', value: '' };
  }
  return out;
}
