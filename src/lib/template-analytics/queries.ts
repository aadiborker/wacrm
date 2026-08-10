import type { SupabaseClient } from '@supabase/supabase-js';

type DB = SupabaseClient;

export interface ChannelMetrics {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

export interface TemplateAnalyticsRow {
  templateName: string;
  language: string | null;
  category: string | null;
  qualityScore: string | null;
  templateStatus: string | null;
  broadcast: ChannelMetrics & { campaigns: number };
  inbox: ChannelMetrics;
  automation: ChannelMetrics;
}

interface MetricsBucket {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

function emptyBucket(): MetricsBucket {
  return { sent: 0, delivered: 0, read: 0, failed: 0 };
}

function bumpMessageStatus(bucket: MetricsBucket, status: string) {
  if (status === 'failed') {
    bucket.failed++;
    return;
  }
  bucket.sent++;
  if (status === 'delivered' || status === 'read') bucket.delivered++;
  if (status === 'read') bucket.read++;
}

function mergeBroadcastRow(
  map: Map<string, TemplateAnalyticsRow>,
  templateName: string,
  row: {
    sent_count?: number | null;
    delivered_count?: number | null;
    read_count?: number | null;
    replied_count?: number | null;
    failed_count?: number | null;
  },
) {
  const key = templateName;
  let entry = map.get(key);
  if (!entry) {
    entry = {
      templateName,
      language: null,
      category: null,
      qualityScore: null,
      templateStatus: null,
      broadcast: { ...emptyBucket(), campaigns: 0 },
      inbox: emptyBucket(),
      automation: emptyBucket(),
    };
    map.set(key, entry);
  }
  entry.broadcast.campaigns++;
  entry.broadcast.sent += row.sent_count ?? 0;
  entry.broadcast.delivered += row.delivered_count ?? 0;
  entry.broadcast.read += row.read_count ?? 0;
  entry.broadcast.failed += row.failed_count ?? 0;
  // replied is broadcast-only; fold into read for funnel display via sent rate elsewhere
  void row.replied_count;
}

/**
 * Aggregate per-template send metrics from broadcasts + inbox/automation messages.
 * RLS scopes queries to the signed-in account automatically.
 */
export async function loadTemplateAnalytics(
  db: DB,
  accountId: string,
): Promise<TemplateAnalyticsRow[]> {
  const map = new Map<string, TemplateAnalyticsRow>();

  const [templatesRes, broadcastsRes, messagesRes] = await Promise.all([
    db
      .from('message_templates')
      .select('name, language, category, quality_score, status')
      .eq('account_id', accountId),
    db
      .from('broadcasts')
      .select('template_name, sent_count, delivered_count, read_count, replied_count, failed_count')
      .eq('account_id', accountId)
      .in('status', ['sent', 'failed', 'sending']),
    db
      .from('messages')
      .select('template_name, status, sender_type, conversations!inner(account_id)')
      .eq('content_type', 'template')
      .eq('conversations.account_id', accountId)
      .not('template_name', 'is', null),
  ]);

  for (const tpl of templatesRes.data ?? []) {
    const name = tpl.name as string;
    if (!map.has(name)) {
      map.set(name, {
        templateName: name,
        language: (tpl.language as string | null) ?? null,
        category: (tpl.category as string | null) ?? null,
        qualityScore: (tpl.quality_score as string | null) ?? null,
        templateStatus: (tpl.status as string | null) ?? null,
        broadcast: { ...emptyBucket(), campaigns: 0 },
        inbox: emptyBucket(),
        automation: emptyBucket(),
      });
    } else {
      const entry = map.get(name)!;
      entry.language = entry.language ?? (tpl.language as string | null);
      entry.category = entry.category ?? (tpl.category as string | null);
      entry.qualityScore =
        entry.qualityScore ?? (tpl.quality_score as string | null);
      entry.templateStatus =
        entry.templateStatus ?? (tpl.status as string | null);
    }
  }

  for (const bc of broadcastsRes.data ?? []) {
    const name = bc.template_name as string;
    if (!name) continue;
    mergeBroadcastRow(map, name, bc);
  }

  for (const msg of messagesRes.data ?? []) {
    const name = msg.template_name as string | null;
    if (!name) continue;
    let entry = map.get(name);
    if (!entry) {
      entry = {
        templateName: name,
        language: null,
        category: null,
        qualityScore: null,
        templateStatus: null,
        broadcast: { ...emptyBucket(), campaigns: 0 },
        inbox: emptyBucket(),
        automation: emptyBucket(),
      };
      map.set(name, entry);
    }
    const sender = msg.sender_type as string;
    const bucket =
      sender === 'bot' ? entry.automation : entry.inbox;
    bumpMessageStatus(bucket, (msg.status as string) ?? 'sent');
  }

  return [...map.values()].sort((a, b) => {
    const aTotal =
      a.broadcast.sent + a.inbox.sent + a.automation.sent;
    const bTotal =
      b.broadcast.sent + b.inbox.sent + b.automation.sent;
    return bTotal - aTotal;
  });
}

export function totalSent(row: TemplateAnalyticsRow): number {
  return row.broadcast.sent + row.inbox.sent + row.automation.sent;
}

export function totalDelivered(row: TemplateAnalyticsRow): number {
  return row.broadcast.delivered + row.inbox.delivered + row.automation.delivered;
}

export function totalRead(row: TemplateAnalyticsRow): number {
  return row.broadcast.read + row.inbox.read + row.automation.read;
}

export function totalFailed(row: TemplateAnalyticsRow): number {
  return row.broadcast.failed + row.inbox.failed + row.automation.failed;
}

export function deliveryRate(sent: number, delivered: number): number {
  if (sent <= 0) return 0;
  return Math.round((delivered / sent) * 100);
}

export function readRate(delivered: number, read: number): number {
  if (delivered <= 0) return 0;
  return Math.round((read / delivered) * 100);
}
