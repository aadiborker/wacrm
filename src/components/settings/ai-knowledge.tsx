'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  BookOpen,
  Link2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface DocSummary {
  id: string;
  title: string;
  category: string | null;
  source_url: string | null;
  updated_at: string;
}

/** Editor target: 'new' when creating, a doc id when editing, null when closed. */
type EditTarget = 'new' | string | null;

type EditorMode = 'paste' | 'url';

const SUGGESTED_CATEGORIES = [
  'FAQ',
  'Pricing',
  'Products',
  'Policies',
  'Company',
  'Projects',
] as const;

export function AiKnowledgeCard({
  accountId,
  canEdit,
  hasEmbeddingsKey,
}: {
  accountId: string | null;
  canEdit: boolean;
  hasEmbeddingsKey: boolean;
}) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditTarget>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('paste');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const loadedAccountIdRef = useRef<string | null>(null);
  const t = useTranslations('Settings.aiKnowledge');

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/knowledge');
      const data = await res.json();
      if (res.ok) setDocs(data.documents ?? []);
      else toast.error(data.error ?? t('loadFailed'));
    } catch {
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!accountId || loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    void fetchDocs();
  }, [accountId, fetchDocs]);

  const categoriesInUse = useMemo(() => {
    const set = new Set<string>();
    for (const d of docs) {
      if (d.category?.trim()) set.add(d.category.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [docs]);

  const filteredDocs = useMemo(() => {
    if (categoryFilter === 'all') return docs;
    if (categoryFilter === 'uncategorized') {
      return docs.filter((d) => !d.category?.trim());
    }
    return docs.filter((d) => d.category === categoryFilter);
  }, [docs, categoryFilter]);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setCategory('');
    setSourceUrl('');
    setImportUrl('');
    setEditorMode('paste');
  };

  const openNew = () => {
    setEditing('new');
    resetForm();
  };

  const openEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/knowledge/${id}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t('openFailed'));
        return;
      }
      setEditing(id);
      setEditorMode('paste');
      setTitle(data.title ?? '');
      setContent(data.content ?? '');
      setCategory(data.category ?? '');
      setSourceUrl(data.source_url ?? '');
      setImportUrl('');
    } catch {
      toast.error(t('openFailed'));
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    resetForm();
  };

  const savePaste = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error(t('titleContentRequired'));
      return;
    }
    setSaving(true);
    try {
      const isNew = editing === 'new';
      const res = await fetch(
        isNew ? '/api/ai/knowledge' : `/api/ai/knowledge/${editing}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            content: content.trim(),
            category: category.trim(),
            source_url: sourceUrl.trim(),
          }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        if (data.warning) toast.warning(data.warning);
        else toast.success(isNew ? t('saveSuccessNew') : t('saveSuccessUpdate'));
        cancelEdit();
        await fetchDocs();
      } else {
        toast.error(data.error ?? t('saveFailed'));
      }
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const importFromUrl = async () => {
    if (!importUrl.trim()) {
      toast.error(t('urlRequired'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/ai/knowledge/from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: importUrl.trim(),
          category: category.trim() || undefined,
          title: title.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.warning) toast.warning(data.warning);
        else toast.success(t('importSuccess'));
        cancelEdit();
        await fetchDocs();
      } else {
        toast.error(data.error ?? t('importFailed'));
      }
    } catch {
      toast.error(t('importFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/knowledge/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(t('removeSuccess'));
        setDocs((d) => d.filter((x) => x.id !== id));
      } else {
        const data = await res.json();
        toast.error(data.error ?? t('removeFailed'));
      }
    } catch {
      toast.error(t('removeFailed'));
    }
  };

  const reindex = async () => {
    setReindexing(true);
    try {
      const res = await fetch('/api/ai/knowledge/reindex', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(t('reindexSuccess', { count: data.reindexed }));
      } else {
        toast.error(data.error ?? t('reindexFailed'));
      }
    } catch {
      toast.error(t('reindexFailed'));
    } finally {
      setReindexing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-primary" /> {t('title')}
        </CardTitle>
        <CardDescription>
          {t('description', {
            searchType: hasEmbeddingsKey
              ? t('semanticSearchOn')
              : t('keywordSearchOn'),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center py-4 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('loading')}
          </div>
        ) : (
          <>
            {docs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  active={categoryFilter === 'all'}
                  onClick={() => setCategoryFilter('all')}
                  label={t('filterAll')}
                />
                {categoriesInUse.map((c) => (
                  <FilterChip
                    key={c}
                    active={categoryFilter === c}
                    onClick={() => setCategoryFilter(c)}
                    label={c}
                  />
                ))}
                {docs.some((d) => !d.category?.trim()) && (
                  <FilterChip
                    active={categoryFilter === 'uncategorized'}
                    onClick={() => setCategoryFilter('uncategorized')}
                    label={t('filterUncategorized')}
                  />
                )}
              </div>
            )}

            {filteredDocs.length === 0 && editing === null && (
              <p className="text-sm text-muted-foreground">
                {docs.length === 0 ? t('noDocs') : t('noDocsInFilter')}
              </p>
            )}

            {filteredDocs.length > 0 && (
              <ul className="divide-y divide-border rounded-md border border-border">
                {filteredDocs.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-2 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {doc.title}
                        </span>
                        {doc.category && (
                          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {doc.category}
                          </span>
                        )}
                      </div>
                      {doc.source_url && (
                        <a
                          href={doc.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          <span className="truncate">{doc.source_url}</span>
                        </a>
                      )}
                    </div>
                    {canEdit && (
                      <span className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => void openEdit(doc.id)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => void remove(doc.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {editing !== null ? (
              <div className="space-y-3 rounded-md border border-border p-3">
                {editing === 'new' && (
                  <div className="inline-flex gap-1 rounded-lg border border-border bg-muted p-1">
                    <ModeTab
                      active={editorMode === 'paste'}
                      onClick={() => setEditorMode('paste')}
                      label={t('modePaste')}
                    />
                    <ModeTab
                      active={editorMode === 'url'}
                      onClick={() => setEditorMode('url')}
                      label={t('modeUrl')}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="kb-category">{t('categoryLabel')}</Label>
                  <Input
                    id="kb-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder={t('categoryPlaceholder')}
                    list="kb-category-suggestions"
                    disabled={saving}
                  />
                  <datalist id="kb-category-suggestions">
                    {[...SUGGESTED_CATEGORIES, ...categoriesInUse].map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED_CATEGORIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={saving}
                        onClick={() => setCategory(c)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                          category === c
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {editorMode === 'url' && editing === 'new' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="kb-url">{t('urlLabel')}</Label>
                      <Input
                        id="kb-url"
                        type="url"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        placeholder={t('urlPlaceholder')}
                        disabled={saving}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('urlHint')}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kb-title-optional">
                        {t('editDocTitleOptional')}
                      </Label>
                      <Input
                        id="kb-title-optional"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={t('editDocTitlePlaceholder')}
                        disabled={saving}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
                        {t('cancel')}
                      </Button>
                      <Button onClick={() => void importFromUrl()} disabled={saving}>
                        {saving && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        <Link2 className="mr-2 h-4 w-4" />
                        {t('importUrl')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="kb-title">{t('editDocTitle')}</Label>
                      <Input
                        id="kb-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={t('editDocTitlePlaceholder')}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kb-content">{t('editDocContent')}</Label>
                      <Textarea
                        id="kb-content"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={t('editDocContentPlaceholder')}
                        rows={8}
                        disabled={saving}
                      />
                    </div>
                    {sourceUrl && (
                      <p className="text-xs text-muted-foreground">
                        {t('sourceLabel')}:{' '}
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          {sourceUrl}
                        </a>
                      </p>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
                        {t('cancel')}
                      </Button>
                      <Button onClick={() => void savePaste()} disabled={saving}>
                        {saving && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {t('saveDoc')}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              canEdit && (
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={openNew}>
                    <Plus className="mr-2 h-4 w-4" /> {t('addDoc')}
                  </Button>
                  {hasEmbeddingsKey && docs.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void reindex()}
                      disabled={reindexing}
                      title={t('reindexTooltip')}
                    >
                      {reindexing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      {t('reindex')}
                    </Button>
                  )}
                </div>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  );
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}
