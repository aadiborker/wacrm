// POST /api/shopify/webhook — Shopify → ReplyFlow (orders/create → WhatsApp).

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
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

    // Acknowledge unknown topics quickly (mandatory GDPR topics etc.).
    if (topic !== 'orders/create') {
      return NextResponse.json({ ok: true, ignored: topic });
    }

    const db = supabaseAdmin();
    const { data: connection, error: connErr } = await db
      .from('shopify_connections')
      .select(
        'account_id, order_template_name, order_template_language',
      )
      .eq('shop_domain', shop)
      .maybeSingle();

    if (connErr || !connection) {
      console.warn(`[shopify/webhook] no connection for shop ${shop}`);
      return NextResponse.json({ ok: true, skipped: 'no_connection' });
    }

    const templateName = connection.order_template_name as string | null;
    if (!templateName) {
      console.warn(`[shopify/webhook] no template for shop ${shop}`);
      return NextResponse.json({ ok: true, skipped: 'no_template' });
    }

    let order: Record<string, unknown>;
    try {
      order = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const phone = extractOrderPhone(order);
    if (!phone) {
      console.warn(
        `[shopify/webhook] order ${extractOrderNumber(order)} has no phone`,
      );
      return NextResponse.json({ ok: true, skipped: 'no_phone' });
    }

    const accountId = connection.account_id as string;
    const name = extractOrderCustomerName(order);
    const orderNumber = extractOrderNumber(order);
    const firstName =
      name?.split(/\s+/)[0] ||
      (typeof order.email === 'string' ? order.email : 'there');

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
      // Positional body params — template should use {{1}} order, {{2}} name.
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
      // 200 so Shopify does not retry forever on template/config mistakes.
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
