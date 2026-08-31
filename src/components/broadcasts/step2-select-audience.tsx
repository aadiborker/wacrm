'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Contact, CustomField, Tag } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Users,
  Tags,
  Filter,
  Upload,
  Loader2,
  ArrowRight,
  ArrowLeft,
  X,
  UserCheck,
  Search,
  Check,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BROADCAST_RECIPIENT_LIMIT_MAX,
  cappedAudienceCount,
} from '@/lib/broadcasts/audience-limit';

type AudienceType = 'all' | 'tags' | 'custom_field' | 'csv' | 'contacts';
type CustomFieldOperator = 'is' | 'is_not' | 'contains';

/** Rows shown per search in the contact picker. */
const CONTACT_PICKER_PAGE = 50;
/** Debounce for the picker's search box, in ms. */
const CONTACT_SEARCH_DEBOUNCE_MS = 250;

interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

interface AudienceConfig {
  type: AudienceType;
  tagIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: { phone: string; name?: string }[];
  contactIds?: string[];
  excludeTagIds?: string[];
  recipientLimit?: number;
}

interface Step2Props {
  audience: AudienceConfig;
  onUpdate: (audience: AudienceConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step2SelectAudience({
  audience,
  onUpdate,
  onNext,
  onBack,
}: Step2Props) {
  const t = useTranslations('Broadcasts.wizard');

  const OPERATOR_OPTIONS = useMemo<{ value: CustomFieldOperator; label: string }[]>(() => [
    { value: 'is', label: t('selectAudience.operatorIs') },
    { value: 'is_not', label: t('selectAudience.operatorIsNot') },
    { value: 'contains', label: t('selectAudience.operatorContains') },
  ], [t]);

  const audienceOptions = useMemo<{
    type: AudienceType;
    label: string;
    description: string;
    icon: typeof Users;
  }[]>(() => [
    {
      type: 'all',
      label: t('selectAudience.method.all'),
      description: t('selectAudience.allDescLoading'),
      icon: Users,
    },
    {
      type: 'contacts',
      label: t('selectAudience.method.contacts'),
      description: t('selectAudience.contactsDesc'),
      icon: UserCheck,
    },
    {
      type: 'tags',
      label: t('selectAudience.method.tags'),
      description: t('selectAudience.tagDesc'),
      icon: Tags,
    },
    {
      type: 'custom_field',
      label: t('selectAudience.method.customField'),
      description: t('selectAudience.customFieldDesc'),
      icon: Filter,
    },
    {
      type: 'csv',
      label: t('selectAudience.method.csv'),
      description: t('selectAudience.csvDesc'),
      icon: Upload,
    },
  ], [t]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  // Keeps names/phones for picked contacts that the current search no
  // longer returns, so the selected chips never degrade to bare UUIDs.
  const [pickedContacts, setPickedContacts] = useState<Map<string, Contact>>(
    new Map(),
  );

  // Tags are used both by the primary "Filter by Tags" audience type
  // AND by the exclude-list below — so always load once on mount.
  useEffect(() => {
    async function fetchTags() {
      setLoadingTags(true);
      try {
        const supabase = createClient();
        const { data } = await supabase.from('tags').select('*').order('name');
        setTags(data ?? []);
      } finally {
        setLoadingTags(false);
      }
    }
    fetchTags();
  }, []);

  // Lazy-load custom fields only when that audience type is active.
  useEffect(() => {
    if (audience.type !== 'custom_field') return;
    async function fetchFields() {
      setLoadingFields(true);
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('custom_fields')
          .select('*')
          .order('field_name');
        setCustomFields(data ?? []);
      } finally {
        setLoadingFields(false);
      }
    }
    fetchFields();
  }, [audience.type]);

  // Contact picker search — debounced so typing doesn't fire a query
  // per keystroke. Empty search shows the newest contacts, matching the
  // order of the Contacts page.
  useEffect(() => {
    if (audience.type !== 'contacts') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingContacts(true);
      try {
        const supabase = createClient();
        let query = supabase
          .from('contacts')
          .select('id, name, phone')
          .order('created_at', { ascending: false })
          .limit(CONTACT_PICKER_PAGE);
        const term = contactSearch.trim();
        if (term) {
          // Escape PostgREST's or() delimiters so a comma or paren in
          // the search box can't break out of the filter expression.
          const safe = term.replace(/[,()]/g, ' ');
          query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`);
        }
        const { data } = await query;
        if (!cancelled) setContactResults((data ?? []) as Contact[]);
      } finally {
        if (!cancelled) setLoadingContacts(false);
      }
    }, CONTACT_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [audience.type, contactSearch]);

  // Hydrate labels for ids restored from wizard state (e.g. the user
  // stepped forward then came back) that we've never seen a row for.
  // `hydratedIds` records every id we've already queried — without it,
  // an id that no longer exists in the DB never lands in
  // `pickedContacts` and the effect refetches on every render.
  const hydratedIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const missing = (audience.contactIds ?? []).filter(
      (id) => !hydratedIds.current.has(id),
    );
    if (missing.length === 0) return;
    for (const id of missing) hydratedIds.current.add(id);

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .in('id', missing.slice(0, 100));
      if (cancelled || !data) return;
      setPickedContacts((prev) => {
        const next = new Map(prev);
        for (const c of data as Contact[]) next.set(c.id, c);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [audience.contactIds]);

  const fetchEstimatedCount = useCallback(async () => {
    setLoadingCount(true);
    try {
      const supabase = createClient();

      // Base query — produces the superset before exclude is applied.
      let baseIds: Set<string> | null = null; // null means "all contacts"

      if (audience.type === 'all') {
        // Handled below — full-table count adjusted by excludes.
      } else if (
        audience.type === 'tags' &&
        audience.tagIds &&
        audience.tagIds.length > 0
      ) {
        const { data } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.tagIds);
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (
        audience.type === 'custom_field' &&
        audience.customField?.fieldId &&
        audience.customField.value
      ) {
        const { fieldId, operator, value } = audience.customField;
        let q = supabase
          .from('contact_custom_values')
          .select('contact_id')
          .eq('custom_field_id', fieldId);
        if (operator === 'is') q = q.eq('value', value);
        else if (operator === 'is_not') q = q.neq('value', value);
        else q = q.ilike('value', `%${value}%`);
        const { data } = await q;
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (
        audience.type === 'contacts' &&
        audience.contactIds &&
        audience.contactIds.length > 0
      ) {
        baseIds = new Set(audience.contactIds);
      } else if (
        audience.type === 'csv' &&
        audience.csvContacts &&
        audience.csvContacts.length > 0
      ) {
        setEstimatedCount(audience.csvContacts.length);
        return;
      } else {
        // Partially-configured audience — wait for the user to finish.
        setEstimatedCount(null);
        return;
      }

      // Apply exclude tags
      let excludeSet: Set<string> | null = null;
      if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
        const { data: excludeRows } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.excludeTagIds);
        excludeSet = new Set((excludeRows ?? []).map((r) => r.contact_id));
      }

      if (baseIds) {
        const effective = [...baseIds].filter(
          (id) => !excludeSet?.has(id),
        );
        setEstimatedCount(effective.length);
      } else {
        // "All" — fetch the total, then subtract exclude set if any.
        const { count } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true });
        const total = count ?? 0;
        setEstimatedCount(
          excludeSet ? Math.max(0, total - excludeSet.size) : total,
        );
      }
    } finally {
      setLoadingCount(false);
    }
  }, [
    audience.type,
    audience.tagIds,
    audience.customField,
    audience.csvContacts,
    audience.contactIds,
    audience.excludeTagIds,
    audience.recipientLimit,
  ]);

  useEffect(() => {
    fetchEstimatedCount();
  }, [fetchEstimatedCount]);

  function toggleTag(tagId: string) {
    const current = audience.tagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, tagIds: updated });
  }

  function toggleContact(contact: Contact) {
    const current = audience.contactIds ?? [];
    const isPicked = current.includes(contact.id);
    onUpdate({
      ...audience,
      contactIds: isPicked
        ? current.filter((id) => id !== contact.id)
        : [...current, contact.id],
    });
    if (!isPicked) {
      setPickedContacts((prev) => new Map(prev).set(contact.id, contact));
    }
  }

  function selectAllResults() {
    const current = new Set(audience.contactIds ?? []);
    for (const c of contactResults) current.add(c.id);
    onUpdate({ ...audience, contactIds: [...current] });
    setPickedContacts((prev) => {
      const next = new Map(prev);
      for (const c of contactResults) next.set(c.id, c);
      return next;
    });
  }

  function contactLabel(contact: Contact) {
    return contact.name?.trim() || contact.phone || '';
  }

  function toggleExcludeTag(tagId: string) {
    const current = audience.excludeTagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, excludeTagIds: updated });
  }

  function updateCustomField(patch: Partial<CustomFieldFilter>) {
    const prev = audience.customField ?? {
      fieldId: '',
      operator: 'is' as CustomFieldOperator,
      value: '',
    };
    onUpdate({ ...audience, customField: { ...prev, ...patch } });
  }

  function setRecipientLimit(raw: string) {
    if (!raw.trim()) {
      onUpdate({ ...audience, recipientLimit: undefined });
      return;
    }
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onUpdate({
      ...audience,
      recipientLimit: Math.min(parsed, BROADCAST_RECIPIENT_LIMIT_MAX),
    });
  }

  const displayCount =
    estimatedCount !== null
      ? cappedAudienceCount(estimatedCount, audience.recipientLimit)
      : null;

  const isValid =
    audience.type === 'all' ||
    (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) ||
    (audience.type === 'custom_field' &&
      !!audience.customField?.fieldId &&
      audience.customField.value.length > 0) ||
    (audience.type === 'contacts' &&
      audience.contactIds &&
      audience.contactIds.length > 0) ||
    (audience.type === 'csv' &&
      audience.csvContacts &&
      audience.csvContacts.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('selectAudience.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('selectAudience.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {audienceOptions.map((option: { type: AudienceType; label: string; description: string; icon: typeof Users }) => {
          const isSelected = audience.type === option.type;
          const Icon = option.icon;
          return (
            <button
              key={option.type}
              onClick={() =>
                onUpdate({
                  ...audience,
                  type: option.type,
                  // Wipe shape fields from other types to avoid stale
                  // config leaking across selections.
                  tagIds: option.type === 'tags' ? audience.tagIds : undefined,
                  customField:
                    option.type === 'custom_field'
                      ? audience.customField
                      : undefined,
                  csvContacts:
                    option.type === 'csv' ? audience.csvContacts : undefined,
                  contactIds:
                    option.type === 'contacts'
                      ? audience.contactIds
                      : undefined,
                })
              }
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border bg-card/50 hover:border-border'
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  isSelected
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{option.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {option.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {audience.type === 'contacts' && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              {t('selectAudience.selectContacts')}
            </p>
            <span className="text-xs text-muted-foreground">
              {t('selectAudience.contactsSelected', {
                count: audience.contactIds?.length ?? 0,
              })}
            </span>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              placeholder={t('selectAudience.searchContacts')}
              className="h-9 border-border bg-muted pl-8"
            />
          </div>

          {(audience.contactIds?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              {(audience.contactIds ?? []).map((id) => {
                const contact = pickedContacts.get(id);
                return (
                  <button
                    key={id}
                    onClick={() =>
                      onUpdate({
                        ...audience,
                        contactIds: (audience.contactIds ?? []).filter(
                          (x) => x !== id,
                        ),
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-all hover:bg-primary/20"
                  >
                    {contact ? contactLabel(contact) : '…'}
                    <X className="h-3 w-3" />
                  </button>
                );
              })}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
            {loadingContacts ? (
              <div className="flex items-center gap-2 p-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">
                  {t('selectAudience.summaryCalculating')}
                </span>
              </div>
            ) : contactResults.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">
                {t('selectAudience.noContactsFound')}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {contactResults.map((contact) => {
                  const isPicked = audience.contactIds?.includes(contact.id);
                  return (
                    <li key={contact.id}>
                      <button
                        onClick={() => toggleContact(contact)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                          isPicked ? 'bg-primary/5' : 'hover:bg-muted/50'
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            isPicked
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border'
                          }`}
                        >
                          {isPicked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">
                            {contact.name?.trim() || contact.phone}
                          </span>
                          {contact.name?.trim() && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {contact.phone}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-border text-muted-foreground"
              disabled={contactResults.length === 0}
              onClick={selectAllResults}
            >
              {t('selectAudience.selectAllResults')}
            </Button>
            {(audience.contactIds?.length ?? 0) > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => onUpdate({ ...audience, contactIds: [] })}
              >
                {t('selectAudience.clearSelection')}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              {t('selectAudience.contactsSearchHint', {
                count: CONTACT_PICKER_PAGE,
              })}
            </p>
          </div>
        </div>
      )}

      {audience.type === 'tags' && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="mb-3 text-sm font-medium text-foreground">{t('selectAudience.selectTags')}</p>
          {loadingTags ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('selectAudience.noTagsFound')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = audience.tagIds?.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      isSelected
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-muted text-muted-foreground hover:border-border'
                    }`}
                  >
                    <span
                      className="mr-1.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {audience.type === 'custom_field' && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <p className="text-sm font-medium text-foreground">{t('selectAudience.method.customField')}</p>
          {loadingFields ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : customFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('selectAudience.errorLoadFields')}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)]">
              <select
                value={audience.customField?.fieldId ?? ''}
                onChange={(e) => updateCustomField({ fieldId: e.target.value })}
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">{t('selectAudience.selectField')}</option>
                {customFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.field_name}
                  </option>
                ))}
              </select>
              <select
                value={audience.customField?.operator ?? 'is'}
                onChange={(e) =>
                  updateCustomField({
                    operator: e.target.value as CustomFieldOperator,
                  })
                }
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {OPERATOR_OPTIONS.map((op: { value: CustomFieldOperator; label: string }) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={audience.customField?.value ?? ''}
                onChange={(e) => updateCustomField({ value: e.target.value })}
                placeholder={t('selectAudience.valuePlaceholder')}
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
        </div>
      )}

      {/* Exclude list — applies regardless of audience type */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <X className="h-4 w-4 text-red-400" />
          <p className="text-sm font-medium text-foreground">
            {t('selectAudience.excludeTags')}
          </p>
        </div>
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('selectAudience.noTagsFound')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isExcluded = audience.excludeTagIds?.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleExcludeTag(tag.id)}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    isExcluded
                      ? 'border-red-500/30 bg-red-500/10 text-red-300'
                      : 'border-border bg-muted text-muted-foreground hover:border-border'
                  }`}
                >
                  <span
                    className="mr-1.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Recipient cap — applies after audience + exclude filters */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <Label className="text-sm font-medium text-foreground">
          {t('selectAudience.recipientLimit')}
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('selectAudience.recipientLimitDesc')}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={1}
            max={BROADCAST_RECIPIENT_LIMIT_MAX}
            placeholder={t('selectAudience.recipientLimitPlaceholder')}
            value={audience.recipientLimit ?? ''}
            onChange={(e) => setRecipientLimit(e.target.value)}
            className="h-9 w-32 border-border bg-muted"
          />
          {[100, 500].map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="sm"
              className="border-border text-muted-foreground"
              onClick={() =>
                onUpdate({ ...audience, recipientLimit: preset })
              }
            >
              {t('selectAudience.recipientLimitPreset', { count: preset })}
            </Button>
          ))}
          {audience.recipientLimit != null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() =>
                onUpdate({ ...audience, recipientLimit: undefined })
              }
            >
              {t('selectAudience.recipientLimitClear')}
            </Button>
          )}
        </div>
      </div>

      {/* Audience Summary */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <p className="mb-2 text-sm font-medium text-foreground">
          {t('selectAudience.summaryTitle')}
        </p>
        {loadingCount ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">
              {t('selectAudience.summaryCalculating')}
            </span>
          </div>
        ) : displayCount !== null ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm text-foreground">
                {displayCount.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('selectAudience.summaryRecipients')}
              </span>
            </div>
            {audience.recipientLimit != null &&
              estimatedCount !== null &&
              estimatedCount > audience.recipientLimit && (
                <p className="text-xs text-muted-foreground">
                  {t('selectAudience.summaryCapped', {
                    total: estimatedCount.toLocaleString(),
                    limit: audience.recipientLimit.toLocaleString(),
                  })}
                </p>
              )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t('selectAudience.summaryEmpty')}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={!isValid}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
