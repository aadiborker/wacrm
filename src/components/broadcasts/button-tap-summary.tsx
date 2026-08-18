'use client';

import { MousePointerClick } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { BroadcastButtonTapRow } from '@/lib/broadcasts/button-taps';

interface ButtonTapSummaryProps {
  rows: BroadcastButtonTapRow[];
  tappedTotal: number;
  recipientTotal: number;
  activeButton: string | null;
  onSelectButton: (button: string) => void;
  onClearFilter: () => void;
}

export function ButtonTapSummary({
  rows,
  tappedTotal,
  recipientTotal,
  activeButton,
  onSelectButton,
  onClearFilter,
}: ButtonTapSummaryProps) {
  const t = useTranslations('Broadcasts.detail.buttonTaps');

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
            <MousePointerClick className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t('title')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {tappedTotal > 0
                ? t('subtitle', { count: tappedTotal, total: recipientTotal })
                : t('empty')}
            </p>
          </div>
        </div>
        {activeButton && (
          <button
            type="button"
            onClick={onClearFilter}
            className="text-xs text-primary hover:underline"
          >
            {t('clearFilter')}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('emptyHint')}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const isActive = activeButton === row.button;
            const pct =
              tappedTotal > 0 ? Math.round((row.count / tappedTotal) * 100) : 0;
            return (
              <button
                key={row.button}
                type="button"
                onClick={() => onSelectButton(row.button)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? 'border-indigo-500/50 bg-indigo-500/15'
                    : 'border-border bg-card/60 hover:bg-muted/50'
                }`}
              >
                <span className="min-w-0 truncate font-medium text-foreground">
                  {row.button}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t('count', { count: row.count, pct })}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
