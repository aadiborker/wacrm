// POST /api/shopify/webhook — Shopify order lifecycle → WhatsApp templates.

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  cancelAbandonedForOrder,
  upsertAbandonedCheckoutReminder,
} from '@/lib/shopify/abandoned';
import { isShopifyConfigured } from '@/lib/shopify/config';
import { verifyShopifyWebhookHmac } from '@/lib/shopify/hmac';
import {
  claimShopifyEvent,
  extractTrackingUrl,
  firstNameFrom,
  resolveOrderContact,
  sendLifecycleTemplate,
  SendMessageError,
} from '@/lib/shopify/lifecycle';
import {
  extractOrderCustomerName,
  extractOrderNumber,
  extractOrderPhone,
} from '@/lib/shopify/order';
import { normalizeShopDomain } from '@/lib/shopify/shop';
import { decrypt } from '@/lib/whatsapp/encryption';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';

const CONNECTION_SELECT = [
  'account_id',
  'access_token',
  'order_template_name',
  'order_template_language',
  'abandoned_delay_hours',
  'shipped_template_name',
  'out_for_delivery_template_name',
  'delivered_template_name',
  'cancelled_template_name',
  'payment_failed_template_name',
].join(', ');

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
      .select(CONNECTION_SELECT)
      .eq('shop_domain', shop)
      .maybeSingle();

    if (connErr || !connection) {
      console.warn(`[shopify/webhook] no connection for shop ${shop}`);
      return NextResponse.json({ ok: true, skipped: 'no_connection' });
    }

    const accountId = connection.account_id as string;
    const templateLanguage =
      (connection.order_template_language as string) || 'en';
    let accessToken = '';
    try {
      accessToken = decrypt(connection.access_token as string);
    } catch (err) {
      console.error('[shopify/webhook] decrypt token failed:', err);
      return NextResponse.json({ ok: true, skipped: 'bad_token' });
    }

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

    if (topic === 'orders/create') {
      return handleOrderCreate({
        db,
        connection,
        accountId,
        shop,
        payload,
        templateLanguage,
      });
    }

    if (topic === 'orders/cancelled') {
      return handleOrderCancelled({
        db,
        connection,
        accountId,
        shop,
        payload,
        templateLanguage,
        accessToken,
      });
    }

    if (topic === 'fulfillments/create') {
      return handleFulfillmentCreated({
        db,
        connection,
        accountId,
        shop,
        payload,
        templateLanguage,
        accessToken,
      });
    }

    if (topic === 'fulfillment_events/create') {
      return handleFulfillmentEvent({
        db,
        connection,
        accountId,
        shop,
        payload,
        templateLanguage,
        accessToken,
      });
    }

    if (topic === 'order_transactions/create') {
      return handlePaymentFailed({
        db,
        connection,
        accountId,
        shop,
        payload,
        templateLanguage,
        accessToken,
      });
    }

    return NextResponse.json({ ok: true, ignored: topic });
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

type HandlerCtx = {
  db: ReturnType<typeof supabaseAdmin>;
  connection: Record<string, unknown>;
  accountId: string;
  shop: string;
  payload: Record<string, unknown>;
  templateLanguage: string;
  accessToken?: string;
};

async function handleOrderCreate(ctx: HandlerCtx) {
  const { db, connection, accountId, shop, payload, templateLanguage } = ctx;
  const templateName = connection.order_template_name as string | null;
  if (!templateName) {
    return NextResponse.json({ ok: true, skipped: 'no_template' });
  }

  const shopifyOrderId =
    payload.id != null ? String(payload.id) : extractOrderNumber(payload);

  const claimed = await claimShopifyEvent(db, {
    accountId,
    shopDomain: shop,
    topic: 'orders/create',
    eventKey: shopifyOrderId,
  });
  if (!claimed) {
    return NextResponse.json({ ok: true, skipped: 'duplicate' });
  }

  const phone = extractOrderPhone(payload);
  const email =
    typeof payload.email === 'string' ? payload.email.trim() : null;

  await cancelAbandonedForOrder(db, { shopDomain: shop, phone, email });

  if (!phone) {
    return NextResponse.json({ ok: true, skipped: 'no_phone' });
  }

  const name = extractOrderCustomerName(payload);
  const orderNumber = extractOrderNumber(payload);
  const firstName = firstNameFrom(name, email);

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
    templateLanguage,
    // Template: {{1}} order, {{2}} name
    templateParams: [orderNumber, firstName],
  });

  return NextResponse.json({
    ok: true,
    conversation_id: resolved.conversationId,
  });
}

async function handleOrderCancelled(ctx: HandlerCtx) {
  const {
    db,
    connection,
    accountId,
    shop,
    payload,
    templateLanguage,
    accessToken = '',
  } = ctx;
  const templateName = connection.cancelled_template_name as string | null;
  if (!templateName) {
    return NextResponse.json({ ok: true, skipped: 'no_template' });
  }

  const orderId = payload.id != null ? String(payload.id) : null;
  if (!orderId) {
    return NextResponse.json({ ok: true, skipped: 'no_order_id' });
  }

  const claimed = await claimShopifyEvent(db, {
    accountId,
    shopDomain: shop,
    topic: 'orders/cancelled',
    eventKey: orderId,
  });
  if (!claimed) {
    return NextResponse.json({ ok: true, skipped: 'duplicate' });
  }

  const contact = await resolveOrderContact(
    shop,
    accessToken,
    orderId,
    payload,
  );
  if (!contact.phone) {
    return NextResponse.json({ ok: true, skipped: 'no_phone' });
  }

  const result = await sendLifecycleTemplate(db, {
    accountId,
    templateName,
    templateLanguage,
    phone: contact.phone,
    name: contact.name,
    // {{1}} name, {{2}} order
    templateParams: [firstNameFrom(contact.name), contact.orderNumber],
  });

  return NextResponse.json({ ok: true, ...result });
}

async function handleFulfillmentCreated(ctx: HandlerCtx) {
  const {
    db,
    connection,
    accountId,
    shop,
    payload,
    templateLanguage,
    accessToken = '',
  } = ctx;
  const templateName = connection.shipped_template_name as string | null;
  if (!templateName) {
    return NextResponse.json({ ok: true, skipped: 'no_template' });
  }

  const fulfillmentId =
    payload.id != null ? String(payload.id) : null;
  const orderId =
    payload.order_id != null ? String(payload.order_id) : null;
  if (!fulfillmentId) {
    return NextResponse.json({ ok: true, skipped: 'no_fulfillment_id' });
  }

  const claimed = await claimShopifyEvent(db, {
    accountId,
    shopDomain: shop,
    topic: 'fulfillments/create',
    eventKey: fulfillmentId,
  });
  if (!claimed) {
    return NextResponse.json({ ok: true, skipped: 'duplicate' });
  }

  const contact = await resolveOrderContact(
    shop,
    accessToken,
    orderId,
    null,
  );
  if (!contact.phone) {
    return NextResponse.json({ ok: true, skipped: 'no_phone' });
  }

  const tracking = extractTrackingUrl(payload);
  const result = await sendLifecycleTemplate(db, {
    accountId,
    templateName,
    templateLanguage,
    phone: contact.phone,
    name: contact.name,
    // {{1}} name, {{2}} order, {{3}} tracking
    templateParams: [
      firstNameFrom(contact.name),
      contact.orderNumber,
      tracking,
    ],
  });

  return NextResponse.json({ ok: true, ...result });
}

async function handleFulfillmentEvent(ctx: HandlerCtx) {
  const {
    db,
    connection,
    accountId,
    shop,
    payload,
    templateLanguage,
    accessToken = '',
  } = ctx;

  const status =
    typeof payload.status === 'string' ? payload.status.toLowerCase() : '';
  let templateName: string | null = null;
  let topicKey = '';

  if (status === 'out_for_delivery') {
    templateName = connection.out_for_delivery_template_name as string | null;
    topicKey = 'fulfillment_events/out_for_delivery';
  } else if (status === 'delivered') {
    templateName = connection.delivered_template_name as string | null;
    topicKey = 'fulfillment_events/delivered';
  } else {
    return NextResponse.json({ ok: true, skipped: 'status', status });
  }

  if (!templateName) {
    return NextResponse.json({ ok: true, skipped: 'no_template' });
  }

  const eventId = payload.id != null ? String(payload.id) : null;
  if (!eventId) {
    return NextResponse.json({ ok: true, skipped: 'no_event_id' });
  }

  const claimed = await claimShopifyEvent(db, {
    accountId,
    shopDomain: shop,
    topic: topicKey,
    eventKey: eventId,
  });
  if (!claimed) {
    return NextResponse.json({ ok: true, skipped: 'duplicate' });
  }

  const orderId =
    payload.order_id != null ? String(payload.order_id) : null;
  const contact = await resolveOrderContact(
    shop,
    accessToken,
    orderId,
    null,
  );
  if (!contact.phone) {
    return NextResponse.json({ ok: true, skipped: 'no_phone' });
  }

  const result = await sendLifecycleTemplate(db, {
    accountId,
    templateName,
    templateLanguage,
    phone: contact.phone,
    name: contact.name,
    // {{1}} name, {{2}} order
    templateParams: [firstNameFrom(contact.name), contact.orderNumber],
  });

  return NextResponse.json({ ok: true, status, ...result });
}

async function handlePaymentFailed(ctx: HandlerCtx) {
  const {
    db,
    connection,
    accountId,
    shop,
    payload,
    templateLanguage,
    accessToken = '',
  } = ctx;

  const status =
    typeof payload.status === 'string' ? payload.status.toLowerCase() : '';
  if (status !== 'failure' && status !== 'error') {
    return NextResponse.json({ ok: true, skipped: 'not_failed', status });
  }

  const templateName = connection.payment_failed_template_name as
    | string
    | null;
  if (!templateName) {
    return NextResponse.json({ ok: true, skipped: 'no_template' });
  }

  const txnId = payload.id != null ? String(payload.id) : null;
  if (!txnId) {
    return NextResponse.json({ ok: true, skipped: 'no_txn_id' });
  }

  const claimed = await claimShopifyEvent(db, {
    accountId,
    shopDomain: shop,
    topic: 'order_transactions/failure',
    eventKey: txnId,
  });
  if (!claimed) {
    return NextResponse.json({ ok: true, skipped: 'duplicate' });
  }

  const orderId =
    payload.order_id != null ? String(payload.order_id) : null;
  const contact = await resolveOrderContact(
    shop,
    accessToken,
    orderId,
    null,
  );
  if (!contact.phone) {
    return NextResponse.json({ ok: true, skipped: 'no_phone' });
  }

  const retryUrl =
    (typeof contact.order?.order_status_url === 'string' &&
      contact.order.order_status_url) ||
    (typeof payload.receipt === 'object' &&
    payload.receipt &&
    typeof (payload.receipt as Record<string, unknown>).payment_id === 'string'
      ? String((payload.receipt as Record<string, unknown>).payment_id)
      : null) ||
    'your store checkout';

  const result = await sendLifecycleTemplate(db, {
    accountId,
    templateName,
    templateLanguage,
    phone: contact.phone,
    name: contact.name,
    // {{1}} name, {{2}} order, {{3}} retry URL
    templateParams: [
      firstNameFrom(contact.name),
      contact.orderNumber,
      retryUrl,
    ],
  });

  return NextResponse.json({ ok: true, ...result });
}
