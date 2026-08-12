'use client';

import { useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  dedupeByPhone,
  isUniqueViolation,
  normalizeKey,
} from '@/lib/contacts/dedupe';
import {
  analyzeParsedContactRows,
  type ImportFileAnalysis,
  type ImportResultBreakdown,
} from '@/lib/contacts/import-analysis';
import {
  parseContactCsv,
  type ParsedContactRow,
} from '@/lib/contacts/parse-contact-csv';
import {
  assignImportedContactTags,
  resolveImportTagIds,
  type ContactTagAssignment,
} from '@/lib/contacts/resolve-import-tags';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Tag,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

const DEFAULT_TAG_COLOR = '#3b82f6';
const PREVIEW_LIMIT = 5;

function truncateFilename(name: string, max = 48): string {
  if (name.length <= max) return name;
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.slice(0, name.length - ext.length);
  const keep = max - ext.length - 1;
  return `${base.slice(0, Math.max(keep, 12))}…${ext}`;
}

function PreviewCell({
  value,
  mono,
  maxWidth = 'max-w-[9rem]',
}: {
  value: string;
  mono?: boolean;
  maxWidth?: string;
}) {
  return (
    <span
      className={cn(
        'block truncate',
        maxWidth,
        mono && 'font-mono text-[11px]'
      )}
      title={value}
    >
      {value}
    </span>
  );
}

function ImportPreviewTags({
  tagNames,
  tagColorByKey,
}: {
  tagNames: string[];
  tagColorByKey: Map<string, string>;
}) {
  const t = useTranslations('Contacts.importModal');

  if (tagNames.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex min-w-[4.5rem] flex-wrap gap-1">
      {tagNames.map((name) => {
        const color =
          tagColorByKey.get(name.trim().toLowerCase()) ?? DEFAULT_TAG_COLOR;
        const isKnown = tagColorByKey.has(name.trim().toLowerCase());
        return (
          <span
            key={name}
            className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] leading-none font-medium"
            style={{
              backgroundColor: `${color}18`,
              color,
              border: `1px solid ${color}${isKnown ? '55' : '30'}`,
            }}
            title={isKnown ? name : t('willBeCreated', { name })}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="truncate">{name}</span>
          </span>
        );
      })}
    </div>
  );
}

function StatRow({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'warn' | 'ok' | 'danger';
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-medium tabular-nums',
          tone === 'warn' && 'text-amber-400',
          tone === 'ok' && 'text-primary',
          tone === 'danger' && 'text-red-400',
          tone === 'default' && 'text-popover-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportModal({
  open,
  onOpenChange,
  onImported,
}: ImportModalProps) {
  const t = useTranslations('Contacts.importModal');
  const supabase = createClient();
  const { accountId, canEditSettings } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedContactRow[]>([]);
  const [blankPhoneCount, setBlankPhoneCount] = useState(0);
  const [blankPhoneSamples, setBlankPhoneSamples] = useState<string[]>([]);
  const [hasTagsColumn, setHasTagsColumn] = useState(false);
  const [hasCompanyColumn, setHasCompanyColumn] = useState(false);
  const [tagColorByKey, setTagColorByKey] = useState<Map<string, string>>(
    new Map()
  );
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResultBreakdown | null>(null);

  function reset() {
    setFile(null);
    setParsedRows([]);
    setBlankPhoneCount(0);
    setBlankPhoneSamples([]);
    setHasTagsColumn(false);
    setHasCompanyColumn(false);
    setTagColorByKey(new Map());
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setResult(null);

    const text = await selected.text();
    const {
      rows,
      hasTagsColumn: csvHasTags,
      hasCompanyColumn: csvHasCompany,
      blankPhoneCount: csvBlankPhone,
      blankPhoneSamples: csvBlankSamples,
    } = parseContactCsv(text);

    if (rows.length === 0 && csvBlankPhone === 0) {
      toast.error(t('toastNoValidRows'));
      setParsedRows([]);
      setBlankPhoneCount(0);
      setBlankPhoneSamples([]);
      setHasTagsColumn(false);
      setHasCompanyColumn(false);
      setTagColorByKey(new Map());
      return;
    }

    setParsedRows(rows);
    setBlankPhoneCount(csvBlankPhone);
    setBlankPhoneSamples(csvBlankSamples);
    setHasTagsColumn(csvHasTags);
    setHasCompanyColumn(csvHasCompany);

    if (csvHasTags && accountId) {
      const { data: tags } = await supabase
        .from('tags')
        .select('name, color')
        .eq('account_id', accountId);

      const colors = new Map<string, string>();
      for (const tag of tags ?? []) {
        const key = tag.name.trim().toLowerCase();
        if (!colors.has(key)) colors.set(key, tag.color);
      }
      setTagColorByKey(colors);
    } else {
      setTagColorByKey(new Map());
    }
  }

  async function handleImport() {
    if (parsedRows.length === 0) return;
    setImporting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Not authenticated');
      if (!accountId)
        throw new Error('Your profile is not linked to an account.');

      const analysis = analyzeParsedContactRows(parsedRows);

      let imported = 0;
      let skippedAlreadyExists = 0;
      let failed = 0;
      const failedSamples: ImportResultBreakdown['failedSamples'] = [];

      const {
        unique,
        duplicates: skippedInFileDuplicates,
        empty: skippedEmptyPhone,
      } = dedupeByPhone(parsedRows);

      const { data: existingRows } = await supabase
        .from('contacts')
        .select('phone_normalized')
        .eq('account_id', accountId);
      const existing = new Set(
        (existingRows ?? [])
          .map(
            (r) => (r as { phone_normalized: string | null }).phone_normalized
          )
          .filter((p): p is string => !!p)
      );

      const toInsert = unique.filter((row) => {
        if (existing.has(normalizeKey(row.phone))) {
          skippedAlreadyExists++;
          return false;
        }
        return true;
      });

      const allTagNames = toInsert.flatMap((row) => row.tagNames);
      let tagIdByKey = new Map<string, string>();
      let skippedTagNames: string[] = [];
      if (allTagNames.length > 0) {
        ({ tagIdByKey, skippedNames: skippedTagNames } =
          await resolveImportTagIds(supabase, {
            accountId,
            userId: user.id,
            tagNames: allTagNames,
            canCreateTags: canEditSettings,
          }));
      }

      const tagAssignments: ContactTagAssignment[] = [];
      const chunkSize = 50;

      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const rows = chunk.map((row) => ({
          user_id: user.id,
          account_id: accountId,
          phone: row.phone,
          name: row.name || null,
          email: row.email || null,
          company: row.company || null,
          created_source: 'import' as const,
        }));

        const { data, error } = await supabase
          .from('contacts')
          .insert(rows)
          .select('id');

        if (error) {
          for (let j = 0; j < rows.length; j++) {
            const row = rows[j];
            const source = chunk[j];
            const { data: singleData, error: singleErr } = await supabase
              .from('contacts')
              .insert(row)
              .select('id')
              .single();

            if (!singleErr && singleData) {
              imported++;
              if (source.tagNames.length > 0) {
                tagAssignments.push({
                  contactId: singleData.id,
                  tagNames: source.tagNames,
                });
              }
            } else if (isUniqueViolation(singleErr)) {
              skippedAlreadyExists++;
            } else {
              failed++;
              if (failedSamples.length < 5) {
                const reason =
                  singleErr &&
                  typeof singleErr === 'object' &&
                  'message' in singleErr &&
                  typeof (singleErr as { message?: string }).message ===
                    'string'
                    ? (singleErr as { message: string }).message
                    : 'Save failed';
                failedSamples.push({
                  phone: source.phone,
                  name: source.name,
                  reason,
                });
              }
            }
          }
        } else {
          const inserted = data ?? [];
          imported += inserted.length;
          for (let j = 0; j < inserted.length; j++) {
            const source = chunk[j];
            if (!source || source.tagNames.length === 0) continue;
            tagAssignments.push({
              contactId: inserted[j].id,
              tagNames: source.tagNames,
            });
          }
        }
      }

      let tagsAssigned = 0;
      try {
        tagsAssigned = await assignImportedContactTags(
          supabase,
          tagAssignments,
          tagIdByKey
        );
      } catch {
        toast.warning(t('toastTagsWarning'));
      }

      const breakdown: ImportResultBreakdown = {
        totalRows: analysis.totalRows,
        namesCount: analysis.namesCount,
        uniquePhones: analysis.uniquePhones,
        imported,
        tagsAssigned,
        skippedInFileDuplicates,
        skippedAlreadyExists,
        skippedEmptyPhone,
        skippedBlankPhoneInCsv: blankPhoneCount,
        failed,
        failedSamples,
        duplicateSamples: analysis.duplicateSamples,
        shortPhoneSamples: analysis.shortPhoneSamples,
        skippedTagNames,
      };

      setResult(breakdown);

      if (imported > 0) {
        toast.success(t('toastImported', { count: imported }));
        onImported();
      }
      if (tagsAssigned > 0) {
        toast.success(t('toastTagsAssigned', { count: tagsAssigned }));
      }
      if (skippedTagNames.length > 0) {
        const sample = skippedTagNames.slice(0, 3).join(', ');
        const more =
          skippedTagNames.length > 3
            ? ` (+${skippedTagNames.length - 3} more)`
            : '';
        toast.info(t('toastTagsSkipped', { sample, more }));
      }

      const skippedTotal =
        skippedInFileDuplicates +
        skippedAlreadyExists +
        skippedEmptyPhone +
        blankPhoneCount;
      if (skippedTotal > 0) {
        toast.info(t('toastSkipped', { count: skippedTotal }));
      }
      if (failed > 0) {
        toast.error(t('toastFailed', { count: failed }));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('toastError');
      toast.error(message);
    } finally {
      setImporting(false);
    }
  }

  const preview = parsedRows.slice(0, PREVIEW_LIMIT);
  const previewHasTags =
    hasTagsColumn || preview.some((row) => row.tagNames.length > 0);
  const previewHasCompany =
    hasCompanyColumn && preview.some((row) => row.company?.trim());

  const fileAnalysis: ImportFileAnalysis | null = useMemo(() => {
    if (parsedRows.length === 0 && blankPhoneCount === 0) return null;
    if (parsedRows.length === 0) {
      return {
        totalRows: 0,
        namesCount: 0,
        uniquePhones: 0,
        duplicateInFile: 0,
        emptyNormalizedPhone: 0,
        shortPhone: 0,
        shortPhoneSamples: [],
        duplicateSamples: [],
      };
    }
    return analyzeParsedContactRows(parsedRows);
  }, [parsedRows, blankPhoneCount]);

  const willImport = fileAnalysis != null ? fileAnalysis.uniquePhones : 0;

  const tagStats = useMemo(() => {
    const names = new Set<string>();
    let rowsWithTags = 0;
    for (const row of parsedRows) {
      if (row.tagNames.length === 0) continue;
      rowsWithTags++;
      for (const name of row.tagNames) names.add(name.trim().toLowerCase());
    }
    return { unique: names.size, rowsWithTags };
  }, [parsedRows]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden border-border/80 bg-popover p-0 text-popover-foreground sm:max-w-2xl">
        <div className="shrink-0 space-y-4 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogHeader className="gap-1.5">
            <DialogTitle className="text-lg text-popover-foreground">
              {t('title')}
            </DialogTitle>
            <DialogDescription
              className="leading-relaxed text-muted-foreground"
              dangerouslySetInnerHTML={{
                __html: t.markup('desc', {
                  phoneCode: (chunks) =>
                    `<code class="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">${chunks}</code>`,
                  nameCode: (chunks) =>
                    `<code class="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">${chunks}</code>`,
                  emailCode: (chunks) =>
                    `<code class="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">${chunks}</code>`,
                  companyCode: (chunks) =>
                    `<code class="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">${chunks}</code>`,
                  tagsCode: (chunks) =>
                    `<code class="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">${chunks}</code>`,
                }),
              }}
            />
          </DialogHeader>

          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ')
                fileInputRef.current?.click();
            }}
            className={cn(
              'group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-5 transition-all',
              file
                ? 'border-primary/35 bg-primary/[0.04]'
                : 'hover:border-primary/40 border-border/80 bg-background/40 hover:bg-background/70'
            )}
          >
            {file ? (
              <>
                <div className="bg-primary/15 ring-primary/25 flex size-10 items-center justify-center rounded-lg ring-1">
                  <FileText className="text-primary size-5" />
                </div>
                <p
                  className="max-w-full truncate px-2 text-sm font-medium text-popover-foreground"
                  title={file.name}
                >
                  {truncateFilename(file.name)}
                </p>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {t('rowsReady', { count: parsedRows.length })}
                </span>
              </>
            ) : (
              <>
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted/80 ring-1 ring-border/80 transition-colors group-hover:bg-muted">
                  <Upload className="size-5 text-muted-foreground group-hover:text-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('uploadDropzone')}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t('uploadHint')}
                </p>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {fileAnalysis && !result && (
            <div className="space-y-3 rounded-xl border border-border bg-background/50 p-4">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {t('summaryTitle')}
              </p>
              <div className="space-y-2">
                <StatRow
                  label={t('summaryTotalRows')}
                  value={fileAnalysis.totalRows + blankPhoneCount}
                />
                <StatRow
                  label={t('summaryNames')}
                  value={fileAnalysis.namesCount}
                />
                <StatRow
                  label={t('summaryPhones')}
                  value={fileAnalysis.uniquePhones}
                />
                <StatRow
                  label={t('summaryDuplicates')}
                  value={fileAnalysis.duplicateInFile}
                  tone={fileAnalysis.duplicateInFile > 0 ? 'warn' : 'default'}
                />
                {blankPhoneCount > 0 && (
                  <StatRow
                    label={t('summaryBlankPhone')}
                    value={blankPhoneCount}
                    tone="warn"
                  />
                )}
                {fileAnalysis.shortPhone > 0 && (
                  <StatRow
                    label={t('summaryShortPhone')}
                    value={fileAnalysis.shortPhone}
                    tone="warn"
                  />
                )}
                <StatRow
                  label={t('summaryWillImport')}
                  value={willImport}
                  tone="ok"
                />
              </div>

              {fileAnalysis.duplicateInFile > 0 && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
                  <p>{t('summaryHintDuplicates')}</p>
                  {fileAnalysis.duplicateSamples.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-amber-100/80">
                      {fileAnalysis.duplicateSamples.map((s) => (
                        <li key={s.phone}>
                          {s.phone} ×{s.count}
                          {s.names.length > 0
                            ? ` — ${s.names.slice(0, 2).join(', ')}`
                            : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {blankPhoneCount > 0 && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
                  <p>{t('summaryHintBlankPhone')}</p>
                  {blankPhoneSamples.length > 0 && (
                    <p className="mt-1 font-mono text-[11px] text-amber-100/80">
                      {t('resultSampleLabel')}: {blankPhoneSamples.join(', ')}
                    </p>
                  )}
                </div>
              )}

              {fileAnalysis.shortPhone > 0 && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
                  <p>{t('summaryHintShortPhone')}</p>
                  {fileAnalysis.shortPhoneSamples.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-amber-100/80">
                      {fileAnalysis.shortPhoneSamples.map((s) => (
                        <li key={s.phone}>
                          {s.phone}
                          {s.name ? ` — ${s.name}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {preview.length > 0 && !result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {t('preview', { count: preview.length })}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {tagStats.rowsWithTags > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted/90 px-2 py-0.5 text-[11px] text-muted-foreground">
                      <Tag className="text-primary/80 size-3" />
                      {t('previewTags', {
                        tags: tagStats.unique,
                        contacts: tagStats.rowsWithTags,
                      })}
                    </span>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-border ring-1 ring-border/50">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-xs">
                    <thead>
                      <tr className="border-b border-border bg-background/60">
                        <th className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">
                          {t('columns.phone')}
                        </th>
                        <th className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">
                          {t('columns.name')}
                        </th>
                        <th className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">
                          {t('columns.email')}
                        </th>
                        {previewHasCompany && (
                          <th className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">
                            {t('columns.company')}
                          </th>
                        )}
                        {previewHasTags && (
                          <th className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">
                            {t('columns.tags')}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {preview.map((row, i) => (
                        <tr
                          key={i}
                          className="bg-popover/40 transition-colors hover:bg-muted/30"
                        >
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            <PreviewCell
                              value={row.phone}
                              mono
                              maxWidth="max-w-[7.5rem]"
                            />
                          </td>
                          <td className="px-3 py-2 text-popover-foreground">
                            <PreviewCell
                              value={row.name || '—'}
                              maxWidth="max-w-[8.5rem]"
                            />
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            <PreviewCell
                              value={row.email || '—'}
                              maxWidth="max-w-[10rem]"
                            />
                          </td>
                          {previewHasCompany && (
                            <td className="px-3 py-2 text-muted-foreground">
                              <PreviewCell
                                value={row.company || '—'}
                                maxWidth="max-w-[7rem]"
                              />
                            </td>
                          )}
                          {previewHasTags && (
                            <td className="px-3 py-2 align-top">
                              <ImportPreviewTags
                                tagNames={row.tagNames}
                                tagColorByKey={tagColorByKey}
                              />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {parsedRows.length > PREVIEW_LIMIT && (
                <p className="text-center text-[11px] text-muted-foreground">
                  {t('moreRows', { count: parsedRows.length - PREVIEW_LIMIT })}
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-3 rounded-xl border border-border bg-background/50 p-4">
              <p className="text-sm font-medium text-popover-foreground">
                {t('importComplete')}
              </p>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {t('resultBreakdownTitle')}
              </p>
              <div className="space-y-2">
                <StatRow
                  label={t('summaryTotalRows')}
                  value={result.totalRows + result.skippedBlankPhoneInCsv}
                />
                <StatRow label={t('summaryNames')} value={result.namesCount} />
                <StatRow
                  label={t('summaryPhones')}
                  value={result.uniquePhones}
                />
              </div>

              <div className="mt-1 flex flex-col gap-2 border-t border-border/70 pt-3">
                {result.imported > 0 && (
                  <div className="text-primary flex items-center gap-1.5 text-sm">
                    <CheckCircle className="size-4 shrink-0" />
                    {t('resultImported', { count: result.imported })}
                  </div>
                )}
                {result.tagsAssigned > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-cyan-400">
                    <CheckCircle className="size-4 shrink-0" />
                    {t('resultTags', { count: result.tagsAssigned })}
                  </div>
                )}
                {result.skippedInFileDuplicates > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm text-amber-400">
                      <AlertTriangle className="size-4 shrink-0" />
                      {t('resultSkippedInFile', {
                        count: result.skippedInFileDuplicates,
                      })}
                    </div>
                    <p className="pl-5 text-xs text-muted-foreground">
                      {t('summaryHintDuplicates')}
                    </p>
                    {result.duplicateSamples.length > 0 && (
                      <ul className="pl-5 font-mono text-[11px] text-muted-foreground">
                        {result.duplicateSamples.map((s) => (
                          <li key={s.phone}>
                            {s.phone} ×{s.count}
                            {s.names.length > 0
                              ? ` — ${s.names.slice(0, 2).join(', ')}`
                              : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {result.skippedAlreadyExists > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm text-amber-400">
                      <AlertTriangle className="size-4 shrink-0" />
                      {t('resultSkippedExisting', {
                        count: result.skippedAlreadyExists,
                      })}
                    </div>
                    <p className="pl-5 text-xs text-muted-foreground">
                      {t('summaryHintAlreadyExists')}
                    </p>
                  </div>
                )}
                {(result.skippedBlankPhoneInCsv > 0 ||
                  result.skippedEmptyPhone > 0) && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm text-amber-400">
                      <AlertTriangle className="size-4 shrink-0" />
                      {result.skippedBlankPhoneInCsv > 0
                        ? t('resultSkippedBlank', {
                            count: result.skippedBlankPhoneInCsv,
                          })
                        : t('resultSkippedEmpty', {
                            count: result.skippedEmptyPhone,
                          })}
                    </div>
                    <p className="pl-5 text-xs text-muted-foreground">
                      {t('summaryHintBlankPhone')}
                    </p>
                  </div>
                )}
                {result.failed > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm text-red-400">
                      <XCircle className="size-4 shrink-0" />
                      {t('resultFailedDetail', { count: result.failed })}
                    </div>
                    <p className="pl-5 text-xs text-muted-foreground">
                      {t('summaryHintFailed')}
                    </p>
                    {result.failedSamples.length > 0 && (
                      <ul className="pl-5 font-mono text-[11px] text-red-300/80">
                        {result.failedSamples.map((s) => (
                          <li key={`${s.phone}-${s.reason}`}>
                            {s.phone}
                            {s.name ? ` (${s.name})` : ''}: {s.reason}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-0 shrink-0 gap-2 border-t border-border/80 bg-background/50 px-6 py-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            {result ? t('close') : t('cancel')}
          </Button>
          {!result && (
            <Button
              type="button"
              disabled={parsedRows.length === 0 || importing}
              onClick={handleImport}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {importing && <Loader2 className="size-4 animate-spin" />}
              {parsedRows.length > 0
                ? t('importBtn', { count: willImport })
                : t('importBtn', { count: 0 })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
