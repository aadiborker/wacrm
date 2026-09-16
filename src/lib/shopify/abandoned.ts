import type { SupabaseClient } from '@supabase/supabase-js';

import {
  extractCheckoutCustomerName,
  extractCheckoutEmail,
  extractCheckoutPhone,
  extractCheckoutUrl,
  isCheckoutCompleted,
} from './checkout';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import {
  sendMessageToConversation,
  SendMessageError,
} from '@/lib/whatsapp/send-message';

export async function upsertAbandonedCheckoutReminder(
  db: SupabaseClient,
  params: {
    accountId: string;
    shopDomain: string;
    checkout: Record<string, unknown>;
    delayHours: number;
  },
): Promise<{ skipped?: string; scheduled?: boolean }> {
  const { accountId, shopDomain, checkout, delayHours } = params;
  const checkoutId =
    checkout.id != null
      ? String(checkout.id)
      : typeof checkout.token === 'string'
        ? checkout.token
        : null;
  if (!checkoutId) return { skipped: 'no_checkout_id' };

  if (isCheckoutCompleted(checkout)) {
    await db
      .from('shopify_abandoned_checkouts')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('shop_domain', shopDomain)
      .eq('shopify_checkout_id', checkoutId)
      .eq('status', 'pending');
    return { skipped: 'completed' };
  }

  const phone = extractCheckoutPhone(checkout);
  const email = extractCheckoutEmail(checkout);
  const name = extractCheckoutCustomerName(checkout);
  const checkoutUrl = extractCheckoutUrl(checkout);

  // Need a phone to send WhatsApp later; still store if we have email+url
  // so a later checkouts/update with phone can fill it in.
  if (!phone && !email) {
    return { skipped: 'no_contact' };
  }

  const hours = Math.max(0, Math.min(168, delayHours));
  const remindAt = new Date(
    Date.now() + hours * 60 * 60 * 1000,
  ).toISOString();
  const now = new Date().toISOString();

  const { data: existing } = await db
    .from('shopify_abandoned_checkouts')
    .select('id, status')
    .eq('shop_domain', shopDomain)
    .eq('shopify_checkout_id', checkoutId)
    .maybeSingle();

  if (existing?.status === 'sent') {
    return { skipped: 'already_sent' };
  }

  const row = {
    account_id: accountId,
    shop_domain: shopDomain,
    shopify_checkout_id: checkoutId,
    phone,
    email,
    customer_name: name,
    checkout_url: checkoutUrl,
    status: 'pending' as const,
    remind_at: remindAt,
    updated_at: now,
  };

  if (existing) {
    const { error } = await db
      .from('shopify_abandoned_checkouts')
      .update(row)
      .eq('id', existing.id);
    if (error) {
      console.error('[shopify] abandoned upsert update:', error);
      return { skipped: 'db' };
    }
  } else {
    const { error } = await db.from('shopify_abandoned_checkouts').insert({
      ...row,
      created_at: now,
    });
    if (error) {
      console.error('[shopify] abandoned upsert insert:', error);
      return { skipped: 'db' };
    }
  }

  return { scheduled: true };
}

export async function cancelAbandonedForOrder(
  db: SupabaseClient,
  params: {
    shopDomain: string;
    phone: string | null;
    email: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { shopDomain, phone, email } = params;

  if (phone) {
    await db
      .from('shopify_abandoned_checkouts')
      .update({ status: 'cancelled', updated_at: now })
      .eq('shop_domain', shopDomain)
      .eq('status', 'pending')
      .eq('phone', phone);
  }

  if (email) {
    await db
      .from('shopify_abandoned_checkouts')
      .update({ status: 'cancelled', updated_at: now })
      .eq('shop_domain', shopDomain)
      .eq('status', 'pending')
      .eq('email', email.toLowerCase());
  }
}

export async function processDueAbandonedCheckouts(
  db: SupabaseClient,
  limit = 25,
): Promise<{ processed: number; sent: number; skipped: number }> {
  const now = new Date().toISOString();
  const { data: due, error } = await db
    .from('shopify_abandoned_checkouts')
    .select(
      'id, account_id, shop_domain, phone, customer_name, checkout_url, status',
    )
    .eq('status', 'pending')
    .lte('remind_at', now)
    .order('remind_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[shopify/cron] list due:', error);
    throw error;
  }
  if (!due?.length) return { processed: 0, sent: 0, skipped: 0 };

  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const row of due) {
    const { data: claim } = await db
      .from('shopify_abandoned_checkouts')
      .update({ status: 'sent', sent_at: now, updated_at: now })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (!claim) continue;
    processed++;

    const accountId = row.account_id as string;
    const { data: connection } = await db
      .from('shopify_connections')
      .select(
        'abandoned_template_name, abandoned_template_language',
      )
      .eq('account_id', accountId)
      .maybeSingle();

    const templateName = connection?.abandoned_template_name as
      | string
      | null
      | undefined;
    const phone = typeof row.phone === 'string' ? row.phone.trim() : '';
    const checkoutUrl =
      typeof row.checkout_url === 'string' ? row.checkout_url.trim() : '';

    if (!templateName || !phone || !checkoutUrl) {
      await db
        .from('shopify_abandoned_checkouts')
        .update({ status: 'skipped', updated_at: now })
        .eq('id', row.id);
      skipped++;
      continue;
    }

    const name =
      typeof row.customer_name === 'string' && row.customer_name.trim()
        ? row.customer_name.trim()
        : 'there';
    const firstName = name.split(/\s+/)[0] || 'there';

    try {
      const resolved = await resolveConversationByPhone(
        db,
        accountId,
        phone,
        name,
      );
      await sendMessageToConversation(db, accountId, {
        conversationId: resolved.conversationId,
        messageType: 'template',
        templateName,
        templateLanguage:
          (connection?.abandoned_template_language as string) || 'en',
        templateParams: [firstName, checkoutUrl],
      });
      sent++;
    } catch (err) {
      if (err instanceof SendMessageError) {
        console.error(
          `[shopify/cron] send failed for ${row.id}: ${err.code} ${err.message}`,
        );
      } else {
        console.error(`[shopify/cron] send failed for ${row.id}:`, err);
      }
      await db
        .from('shopify_abandoned_checkouts')
        .update({ status: 'skipped', updated_at: now })
        .eq('id', row.id);
      skipped++;
    }
  }

  return { processed, sent, skipped };
}
