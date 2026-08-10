// Server-side broadcast fan-out — scheduled cron + retry failed.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Contact, MessageTemplate } from '@/types';
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api';
import { decrypt } from '@/lib/whatsapp/encryption';
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard';
import {
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils';

import {
  fetchCustomValueIndex,
  parseHeaderMediaUrl,
  parseVariableMappings,
  resolveVariables,
} from './variables';
import { undeliveredRetryHours, undeliveredSentBeforeIso } from './undelivered';

const SEND_BATCH_SIZE = 10;
const SEND_BATCH_DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RecipientRow {
  id: string;
  contact_id: string | null;
  status: string;
  contact?: Contact | null;
}

export interface ExecuteBroadcastOptions {
  /** When set, only these recipient row ids are sent. */
  recipientIds?: string[];
  /** When true, only recipients with status `failed` are retried. */
  onlyFailed?: boolean;
  /** When true, only stale `sent` rows with no delivery are retried. */
  onlyUndelivered?: boolean;
  /** Override the stale-sent threshold (hours). */
  undeliveredOlderThanHours?: number;
}

/**
 * Fan out template sends for an existing broadcast + recipient rows.
 * Used by the scheduled cron and the retry-failed API.
 */
export async function executeBroadcastSend(
  db: SupabaseClient,
  broadcastId: string,
  options: ExecuteBroadcastOptions = {},
): Promise<{ sent: number; failed: number; total: number }> {
  const { data: broadcast, error: bcErr } = await db
    .from('broadcasts')
    .select('*')
    .eq('id', broadcastId)
    .single();

  if (bcErr || !broadcast) {
    throw new Error('Broadcast not found');
  }

  const accountId = broadcast.account_id as string;

  const { data: config, error: configError } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .single();

  if (configError || !config) {
    throw new Error('WhatsApp not configured');
  }

  const accessToken = decrypt(config.access_token);

  const { data: rawTemplateRow } = await db
    .from('message_templates')
    .select('*')
    .eq('account_id', accountId)
    .eq('name', broadcast.template_name)
    .eq('language', broadcast.template_language || 'en_US')
    .maybeSingle();

  if (rawTemplateRow && !isMessageTemplate(rawTemplateRow)) {
    throw new Error('Template row is malformed locally');
  }
  const templateRow = (rawTemplateRow as MessageTemplate | null) ?? null;

  const headerType = templateRow?.header_type;
  const isMediaHeader =
    headerType === 'image' ||
    headerType === 'video' ||
    headerType === 'document';
  const headerMediaUrl = parseHeaderMediaUrl(
    broadcast.audience_filter as Record<string, unknown> | undefined,
  );
  const messageParams =
    isMediaHeader && headerMediaUrl ? { headerMediaUrl } : undefined;

  const variables = parseVariableMappings(
    broadcast.template_variables as Record<string, unknown> | undefined,
  );

  let recipientQuery = db
    .from('broadcast_recipients')
    .select('id, contact_id, status, contact:contacts(*)')
    .eq('broadcast_id', broadcastId);

  if (options.onlyFailed) {
    recipientQuery = recipientQuery.eq('status', 'failed');
  }
  if (options.onlyUndelivered) {
    const hours = options.undeliveredOlderThanHours ?? undeliveredRetryHours();
    recipientQuery = recipientQuery
      .eq('status', 'sent')
      .is('delivered_at', null)
      .lt('sent_at', undeliveredSentBeforeIso(hours));
  }
  if (options.recipientIds?.length) {
    recipientQuery = recipientQuery.in('id', options.recipientIds);
  }

  const { data: recipients, error: recErr } = await recipientQuery;
  if (recErr || !recipients) {
    throw new Error('Failed to load recipients');
  }

  const rows = recipients as unknown as RecipientRow[];
  if (rows.length === 0) {
    return { sent: 0, failed: 0, total: 0 };
  }

  const contactIds = rows
    .map((r) => r.contact?.id)
    .filter((id): id is string => Boolean(id));
  const customValueIndex = await fetchCustomValueIndex(db, contactIds);

  let sent = 0;
  let failed = 0;
  const total = rows.length;

  for (let i = 0; i < rows.length; i += SEND_BATCH_SIZE) {
    const batch = rows.slice(i, i + SEND_BATCH_SIZE);

    for (const recipient of batch) {
      const contact = recipient.contact;
      const phone = contact?.phone;

      if (!phone) {
        failed++;
        await db
          .from('broadcast_recipients')
          .update({
            status: 'failed',
            error_message: 'No phone number on contact',
          })
          .eq('id', recipient.id);
        continue;
      }

      const params = contact
        ? resolveVariables(
            variables,
            contact,
            customValueIndex.get(contact.id),
          )
        : [];

      const variants = phoneVariants(phone);
      let sentMessageId: string | null = null;
      let lastError: string | null = null;

      for (const variant of variants) {
        try {
          const result = await sendTemplateMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: variant,
            templateName: broadcast.template_name,
            language: broadcast.template_language || 'en_US',
            template: templateRow ?? undefined,
            messageParams,
            params,
          });
          sentMessageId = result.messageId;
          lastError = null;
          break;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          lastError = message;
          if (!isRecipientNotAllowedError(message)) break;
        }
      }

      if (sentMessageId) {
        sent++;
        await db
          .from('broadcast_recipients')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            whatsapp_message_id: sentMessageId,
            error_message: null,
          })
          .eq('id', recipient.id);
      } else {
        failed++;
        await db
          .from('broadcast_recipients')
          .update({
            status: 'failed',
            error_message: lastError || 'Unknown error',
          })
          .eq('id', recipient.id);
      }
    }

    if (i + SEND_BATCH_SIZE < rows.length) {
      await sleep(SEND_BATCH_DELAY_MS);
    }
  }

  return { sent, failed, total };
}

/** Finalize broadcast status after a send or retry pass. */
export async function finalizeBroadcastStatus(
  db: SupabaseClient,
  broadcastId: string,
): Promise<void> {
  const { data: rows } = await db
    .from('broadcast_recipients')
    .select('status')
    .eq('broadcast_id', broadcastId);

  const statuses = (rows ?? []).map((r) => r.status as string);
  const anySent = statuses.some(
    (s) =>
      s === 'sent' ||
      s === 'delivered' ||
      s === 'read' ||
      s === 'replied',
  );

  await db
    .from('broadcasts')
    .update({
      status: anySent ? 'sent' : 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', broadcastId);
}

/** Claim a scheduled broadcast and mark it sending (idempotent). */
export async function claimScheduledBroadcast(
  db: SupabaseClient,
  broadcastId: string,
): Promise<boolean> {
  const { data } = await db
    .from('broadcasts')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', broadcastId)
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .select('id')
    .maybeSingle();
  return !!data;
}
