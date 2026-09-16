// POST /api/shopify/webhook — orders/create + checkouts/* → WhatsApp / schedule.

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  cancelAbandonedForOrder,
  upsertAbandonedCheckoutReminder,
} from '@/lib/shopify/abandoned';
import { isShopifyConfigured } from '@/lib/shopify/config';
import { verifyShopifyWebhookHmac } from '@/lib/shopify/hmac';
import {
  extractOrderCustomerName,
  extractOrderNumber,
  extractOrderPhone,
} from '@/lib/shopify/order';
import { normalizeShopDomain } from '@/lib/shopify/shop';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import {
  sendMessageToConversation,
  SendMessageError,
} from '@/lib/whatsapp/send-message';

export async function POST(request: Request) {
  try {
    if (!isShopifyConfigured()) {
      return NextResponse.json({ error: 'not configured' }, { status: 503 });
    }

    const rawBody = await request.text();
    const hmac = request.headers.get('x-shopify-hmac-sha256');
    if (!verifyShopifyWebhookHmac(rawBody, hmac)) {
      return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 });
    }

    const topic = request.headers.get('x-shopify-topic') ?? '';
    const shopHeader = request.headers.get('x-shopify-shop-domain') ?? '';
    const shop = normalizeShopDomain(shopHeader);
    if (!shop) {
      return NextResponse.json({ error: 'Invalid shop' }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: connection, error: connErr } = await db
      .from('shopify_connections')
      .select(
        'account_id, order_template_name, order_template_language, abandoned_delay_hours',
      )
      .eq('shop_domain', shop)
      .maybeSingle();

    if (connErr || !connection) {
      console.warn(`[shopify/webhook] no connection for shop ${shop}`);
      return NextResponse.json({ ok: true, skipped: 'no_connection' });
    }

    const accountId = connection.account_id as string;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (topic === 'checkouts/create' || topic === 'checkouts/update') {
      const delayHours =
        typeof connection.abandoned_delay_hours === 'number'
          ? connection.abandoned_delay_hours
          : 10;
      const result = await upsertAbandonedCheckoutReminder(db, {
        accountId,
        shopDomain: shop,
        checkout: payload,
        delayHours,
      });
      return NextResponse.json({ ok: true, topic, ...result });
    }

    if (topic !== 'orders/create') {
      return NextResponse.json({ ok: true, ignored: topic });
    }

    const templateName = connection.order_template_name as string | null;
    if (!templateName) {
      console.warn(`[shopify/webhook] no template for shop ${shop}`);
      return NextResponse.json({ ok: true, skipped: 'no_template' });
    }

    const shopifyOrderId =
      payload.id != null ? String(payload.id) : extractOrderNumber(payload);

    const { error: claimErr } = await db.from('shopify_order_events').insert({
      account_id: accountId,
      shop_domain: shop,
      shopify_order_id: shopifyOrderId,
      topic: 'orders/create',
    });

    if (claimErr) {
      if (claimErr.code === '23505') {
        console.info(
          `[shopify/webhook] duplicate order ${shopifyOrderId} for ${shop} — skip`,
        );
        return NextResponse.json({ ok: true, skipped: 'duplicate' });
      }
      console.error('[shopify/webhook] claim error:', claimErr);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    const phone = extractOrderPhone(payload);
    const email =
      typeof payload.email === 'string' ? payload.email.trim() : null;

    // Customer completed purchase — don't send abandoned reminder.
    await cancelAbandonedForOrder(db, {
      shopDomain: shop,
      phone,
      email,
    });

    if (!phone) {
      console.warn(
        `[shopify/webhook] order ${extractOrderNumber(payload)} has no phone`,
      );
      return NextResponse.json({ ok: true, skipped: 'no_phone' });
    }

    const name = extractOrderCustomerName(payload);
    const orderNumber = extractOrderNumber(payload);
    const firstName =
      name?.split(/\s+/)[0] ||
      (typeof payload.email === 'string' ? payload.email : 'there');

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
        (connection.order_template_language as string) || 'en',
      templateParams: [orderNumber, firstName],
    });

    return NextResponse.json({
      ok: true,
      conversation_id: resolved.conversationId,
      contact_created: resolved.contactCreated,
    });
  } catch (err) {
    if (err instanceof SendMessageError) {
      console.error(
        `[shopify/webhook] send failed: ${err.code} ${err.message}`,
      );
      return NextResponse.json({
        ok: false,
        error: err.code,
        message: err.message,
      });
    }
    console.error('[shopify/webhook]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
