'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Copy,
  Loader2,
  Plus,
  Trash2,
  Webhook,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequireRole } from '@/components/auth/require-role';
import { useAuth } from '@/hooks/use-auth';
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_DESCRIPTIONS,
  type WebhookEvent,
} from '@/lib/webhooks/events';
import type { ApiWebhookEndpoint } from '@/lib/webhooks/endpoints';
import { SettingsPanelHead } from './settings-panel-head';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function IntegrationsSettings() {
  const { canEditSettings } = useAuth();
  const t = useTranslations('Settings.integrations');

  const [webhooks, setWebhooks] = useState<ApiWebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/webhooks', { cache: 'no-store' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('loadFailed'));
        return;
      }
      const data = (await res.json()) as { webhooks: ApiWebhookEndpoint[] };
      setWebhooks(data.webhooks);
    } catch (err) {
      console.error('[IntegrationsSettings] load error:', err);
      toast.error(t('networkError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(endpoint: ApiWebhookEndpoint) {
    setDeleting(endpoint.id);
    try {
      const res = await fetch(`/api/account/webhooks/${endpoint.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('deleteFailed'));
        return;
      }
      toast.success(t('deleteSuccess'));
      setWebhooks((prev) => prev.filter((w) => w.id !== endpoint.id));
    } catch (err) {
      console.error('[IntegrationsSettings] delete error:', err);
      toast.error(t('networkError'));
    } finally {
      setDeleting(null);
    }
  }

  async function handleToggle(endpoint: ApiWebhookEndpoint) {
    try {
      const res = await fetch(`/api/account/webhooks/${endpoint.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !endpoint.is_active }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('updateFailed'));
        return;
      }
      const data = (await res.json()) as { webhook: ApiWebhookEndpoint };
      setWebhooks((prev) =>
        prev.map((w) => (w.id === endpoint.id ? data.webhook : w)),
      );
    } catch (err) {
      toast.error(t('networkError'));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-8 duration-200">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
      />

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-medium text-foreground">
            {t('crmTitle')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('crmDesc')}</p>
          <ul className="text-sm text-muted-foreground list-disc space-y-1 pl-5">
            <li>{t('crmStep1')}</li>
            <li>{t('crmStep2')}</li>
            <li>{t('crmStep3')}</li>
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href="/settings?tab=api"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {t('openApiKeys')}
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <SettingsPanelHead
          title={t('webhooksTitle')}
          description={t.rich('webhooksDesc', {
            headerCode: (chunks: ReactNode) => (
              <code className="text-xs">{chunks}</code>
            ),
          })}
          action={
            <RequireRole min="admin">
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                {t('newWebhook')}
              </Button>
            </RequireRole>
          }
        />

        {webhooks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <Webhook className="text-muted-foreground size-6" />
              <p className="text-muted-foreground mt-2 text-sm">
                {t('noWebhooks')}
              </p>
              {canEditSettings ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  {t('createWebhookHint')}
                </p>
              ) : (
                <p className="text-muted-foreground mt-1 text-xs">
                  {t('askAdminHint')}
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-border divide-y">
                {webhooks.map((w) => (
                  <li
                    key={w.id}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`truncate text-sm font-medium ${
                            w.is_active
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {w.url}
                        </span>
                        {!w.is_active && (
                          <Badge
                            className="border-border bg-muted text-muted-foreground text-[10px] tracking-wide uppercase"
                          >
                            {t('disabled')}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {w.events.map((ev) => (
                          <Badge
                            key={ev}
                            className="border-border bg-muted text-muted-foreground text-[10px]"
                          >
                            {ev}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-muted-foreground mt-1.5 text-xs">
                        {t('created', { date: fmtDate(w.created_at) })}
                        {w.last_delivery_at
                          ? ` · ${t('lastDelivery', {
                              date: fmtDate(w.last_delivery_at),
                            })}`
                          : ''}
                        {w.failure_count > 0
                          ? ` · ${t('failures', { count: w.failure_count })}`
                          : ''}
                      </p>
                    </div>

                    <RequireRole min="admin">
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleToggle(w)}
                        >
                          {w.is_active ? t('disable') : t('enable')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDelete(w)}
                          disabled={deleting === w.id}
                          className="border-red-500/40 bg-red-500/10 text-red-300 hover:border-red-500/60 hover:bg-red-500/20 hover:text-red-200"
                        >
                          {deleting === w.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                          {t('delete')}
                        </Button>
                      </div>
                    </RequireRole>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <CreateWebhookDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={load}
      />
    </section>
  );
}

function CreateWebhookDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations('Settings.integrations');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>([
    'message.received',
    'contact.created',
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  function reset() {
    setUrl('');
    setEvents(['message.received', 'contact.created']);
    setSubmitting(false);
    setCreatedSecret(null);
  }

  function toggleEvent(event: WebhookEvent, checked: boolean) {
    setEvents((prev) =>
      checked ? [...prev, event] : prev.filter((e) => e !== event),
    );
  }

  async function handleCreate() {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error(t('urlRequired'));
      return;
    }
    if (events.length === 0) {
      toast.error(t('eventsRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, events }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t('createFailed'));
        return;
      }
      setCreatedSecret(data.secret as string);
      onCreated();
    } catch (err) {
      console.error('[CreateWebhookDialog]', err);
      toast.error(t('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function copySecret() {
    if (!createdSecret) return;
    try {
      await navigator.clipboard.writeText(createdSecret);
      toast.success(t('copySuccess'));
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="border-border bg-card sm:max-w-md">
        {createdSecret ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('secretTitle')}</DialogTitle>
              <DialogDescription>{t('secretDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>{t('signingSecret')}</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={createdSecret}
                  className="font-mono text-xs"
                />
                <Button variant="outline" size="icon" onClick={() => void copySecret()}>
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>{t('done')}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('newWebhookTitle')}</DialogTitle>
              <DialogDescription>{t('newWebhookDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="webhook-url">{t('urlLabel')}</Label>
                <Input
                  id="webhook-url"
                  placeholder="https://hooks.zapier.com/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('eventsLabel')}</Label>
                <div className="space-y-2">
                  {WEBHOOK_EVENTS.map((event) => (
                    <label
                      key={event}
                      className="flex items-start gap-2 text-sm"
                    >
                      <Checkbox
                        checked={events.includes(event)}
                        onCheckedChange={(c) =>
                          toggleEvent(event, c === true)
                        }
                      />
                      <span>
                        <span className="font-mono text-xs text-foreground">
                          {event}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {WEBHOOK_EVENT_DESCRIPTIONS[event]}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                {t('cancel')}
              </Button>
              <Button onClick={() => void handleCreate()} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {submitting ? t('creating') : t('createWebhook')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
