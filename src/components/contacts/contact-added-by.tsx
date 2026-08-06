'use client';

import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export function resolveAddedByLabel(
  t: (key: string) => string,
  source: string | null | undefined,
  actorName: string | null | undefined,
): { primary: string; secondary?: string } {
  const name = actorName?.trim() || t('unknown');

  switch (source) {
    case 'whatsapp':
      return { primary: t('viaWhatsApp'), secondary: t('inboundMessage') };
    case 'api':
      return { primary: t('viaApi'), secondary: actorName?.trim() || undefined };
    case 'import':
      return { primary: name, secondary: t('csvImport') };
    case 'broadcast':
      return { primary: name, secondary: t('broadcastAudience') };
    case 'manual':
      return { primary: name, secondary: t('addedManually') };
    default:
      return { primary: name };
  }
}

/**
 * Admin-only attribution: who/what created this contact.
 * Reads profiles for the audit `user_id` and formats with `created_source`.
 */
export function ContactAddedBy({
  userId,
  createdSource,
  createdAt,
  className,
  compact = false,
  /** Skip the profile fetch when the parent already resolved the name. */
  actorName: actorNameProp,
}: {
  userId: string;
  createdSource?: string | null;
  createdAt?: string;
  className?: string;
  compact?: boolean;
  actorName?: string | null;
}) {
  const t = useTranslations('Contacts.addedBy');
  const [actorName, setActorName] = useState<string | null>(
    actorNameProp ?? null,
  );
  const [loaded, setLoaded] = useState(actorNameProp !== undefined);

  useEffect(() => {
    if (actorNameProp !== undefined) {
      setActorName(actorNameProp);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      setActorName(data?.full_name?.trim() || data?.email || null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, actorNameProp]);

  if (!loaded) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)}>
        {t('loading')}
      </span>
    );
  }

  const { primary, secondary } = resolveAddedByLabel(t, createdSource, actorName);
  const dateLabel = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  if (compact) {
    return (
      <span
        className={cn('text-xs text-muted-foreground', className)}
        title={secondary}
      >
        {primary}
      </span>
    );
  }

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2',
        className,
      )}
    >
      <UserPlus className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">
          {t('label')}: {primary}
        </p>
        {(secondary || dateLabel) && (
          <p className="text-[11px] text-muted-foreground">
            {[secondary, dateLabel].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}
