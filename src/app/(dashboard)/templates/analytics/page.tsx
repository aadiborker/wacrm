'use client';

import { useEffect, useState } from 'react';
import { Loader2, BarChart3 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  deliveryRate,
  loadTemplateAnalytics,
  readRate,
  totalDelivered,
  totalFailed,
  totalRead,
  totalSent,
  type TemplateAnalyticsRow,
} from '@/lib/template-analytics/queries';
import { templateStatusConfig } from '@/lib/template-status';
import type { MessageTemplateStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function RateBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted">
        <div
          className="h-1.5 rounded-full bg-primary transition-[width]"
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{value}%</span>
    </div>
  );
}

export default function TemplateAnalyticsPage() {
  const t = useTranslations('Templates.analytics');
  const { accountId } = useAuth();
  const [rows, setRows] = useState<TemplateAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      setLoading(true);
      try {
        const data = await loadTemplateAnalytics(supabase, accountId);
        if (!cancelled) {
          setRows(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('loadFailed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, t]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <BarChart3 className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('emptyHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">
                      {t('table.template')}
                    </TableHead>
                    <TableHead className="text-muted-foreground">
                      {t('table.status')}
                    </TableHead>
                    <TableHead className="text-muted-foreground">
                      {t('table.sent')}
                    </TableHead>
                    <TableHead className="text-muted-foreground">
                      {t('table.delivered')}
                    </TableHead>
                    <TableHead className="text-muted-foreground">
                      {t('table.read')}
                    </TableHead>
                    <TableHead className="text-muted-foreground">
                      {t('table.failed')}
                    </TableHead>
                    <TableHead className="text-muted-foreground">
                      {t('table.channels')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const sent = totalSent(row);
                    const delivered = totalDelivered(row);
                    const read = totalRead(row);
                    const failed = totalFailed(row);
                    const statusKey = row.templateStatus;
                    const status =
                      statusKey && statusKey in templateStatusConfig
                        ? templateStatusConfig[
                            statusKey as MessageTemplateStatus
                          ]
                        : null;

                    return (
                      <TableRow key={row.templateName} className="border-border">
                        <TableCell>
                          <div className="font-medium text-foreground">
                            {row.templateName}
                          </div>
                          {row.language && (
                            <div className="text-xs text-muted-foreground uppercase">
                              {row.language}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {status ? (
                            <Badge className={`text-xs border ${status.classes}`}>
                              {status.label}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-foreground">
                          {sent.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="text-foreground">
                            {delivered.toLocaleString()}
                          </div>
                          <RateBar value={deliveryRate(sent, delivered)} />
                        </TableCell>
                        <TableCell>
                          <div className="text-foreground">
                            {read.toLocaleString()}
                          </div>
                          <RateBar value={readRate(delivered, read)} />
                        </TableCell>
                        <TableCell className="text-foreground">
                          {failed.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div>
                            {t('channelBroadcast', {
                              count: row.broadcast.sent,
                              campaigns: row.broadcast.campaigns,
                            })}
                          </div>
                          <div>
                            {t('channelInbox', { count: row.inbox.sent })}
                          </div>
                          <div>
                            {t('channelAutomation', {
                              count: row.automation.sent,
                            })}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
