'use client';

import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { BroadcastErrorSummaryRow } from '@/lib/broadcasts/error-summary';

interface FailedReasonSummaryProps {
  rows: BroadcastErrorSummaryRow[];
  failedTotal: number;
  activeCode: string | null;
  onSelectCode: (code: string) => void;
  onClearFilter: () => void;
}

function errorLabels(
  code: string,
  t: ReturnType<typeof useTranslations<'Broadcasts.detail.failedReasons'>>,
): { title: string; tip: string } {
  const key = errorTitleKey(code);
  switch (key) {
    case 'other':
    case 'code_131026':
    case 'code_131049':
    case 'code_130472':
      return { title: t(key), tip: t(`${key}_tip`) };
    default:
      return { title: t('unknownCode'), tip: t('unknownTip') };
  }
}

function errorTitleKey(code: string): string {
  if (code === 'other') return 'other';
  return `code_${code}`;
}

export function FailedReasonSummary({
  rows,
  failedTotal,
  activeCode,
  onSelectCode,
  onClearFilter,
}: FailedReasonSummaryProps) {
  const t = useTranslations('Broadcasts.detail.failedReasons');

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
            <AlertCircle className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t('title')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('subtitle', { count: failedTotal })}
            </p>
          </div>
        </div>
        {activeCode && (
          <button
            type="button"
            onClick={onClearFilter}
            className="text-xs text-primary hover:underline"
          >
            {t('clearFilter')}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {rows.map((row) => {
          const isActive = activeCode === row.code;
          const pct =
            failedTotal > 0 ? Math.round((row.count / failedTotal) * 100) : 0;
          const { title, tip } = errorLabels(row.code, t);

          return (
            <button
              key={row.code}
              type="button"
              onClick={() => onSelectCode(row.code)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                isActive
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-border/60 bg-card/40 hover:border-border hover:bg-card/80'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium text-red-300">
                    {row.code === 'other' ? t('otherCode') : `#${row.code}`}
                  </span>
                  <span className="text-sm text-foreground">{title}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {t('count', { count: row.count, pct })}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{tip}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
