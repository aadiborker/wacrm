import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchShopifyOrder } from './admin-api';
import {
  extractOrderCustomerName,
  extractOrderNumber,
  extractOrderPhone,
} from './order';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import {
  sendMessageToConversation,
  SendMessageError,
} from '@/lib/whatsapp/send-message';

export type ShopifyConnectionRow = {
  account_id: string;
  access_token?: string | null;
  order_template_language?: string | null;
  shipped_template_name?: string | null;
  out_for_delivery_template_name?: string | null;
  delivered_template_name?: string | null;
  cancelled_template_name?: string | null;
  payment_failed_template_name?: string | null;
};

/** Claim once per (shop, topic, eventKey). Returns false if duplicate. */
export async function claimShopifyEvent(
  db: SupabaseClient,
  params: {
    accountId: string;
    shopDomain: string;
    topic: string;
    eventKey: string;
  },
): Promise<boolean> {
  const { error } = await db.from('shopify_order_events').insert({
    account_id: params.accountId,
    shop_domain: params.shopDomain,
    shopify_order_id: params.eventKey,
    topic: params.topic,
  });
  if (error) {
    if (error.code === '23505') return false;
    console.error('[shopify] claim event:', error);
    throw error;
  }
  return true;
}

export async function resolveOrderContact(
  shop: string,
  accessToken: string,
  orderId: string | number | null | undefined,
  fallback?: Record<string, unknown> | null,
): Promise<{
  phone: string | null;
  name: string | null;
  orderNumber: string;
  order: Record<string, unknown> | null;
}> {
  let order = fallback ?? null;
  if ((!order || !extractOrderPhone(order)) && orderId != null) {
    order = await fetchShopifyOrder(shop, accessToken, orderId);
  }

  if (!order) {
    return { phone: null, name: null, orderNumber: 'order', order: null };
  }

  return {
    phone: extractOrderPhone(order),
    name: extractOrderCustomerName(order),
    orderNumber: extractOrderNumber(order),
    order,
  };
}

export function firstNameFrom(name: string | null, email?: string | null): string {
  if (name?.trim()) return name.trim().split(/\s+/)[0] || 'there';
  if (email?.trim()) return email.trim();
  return 'there';
}

export function extractTrackingUrl(
  fulfillment: Record<string, unknown>,
): string {
  if (
    typeof fulfillment.tracking_url === 'string' &&
    fulfillment.tracking_url.trim()
  ) {
    return fulfillment.tracking_url.trim();
  }
  const urls = fulfillment.tracking_urls;
  if (Array.isArray(urls) && typeof urls[0] === 'string' && urls[0].trim()) {
    return urls[0].trim();
  }
  if (
    typeof fulfillment.tracking_number === 'string' &&
    fulfillment.tracking_number.trim()
  ) {
    return fulfillment.tracking_number.trim();
  }
  return 'your tracking link';
}

export async function sendLifecycleTemplate(
  db: SupabaseClient,
  params: {
    accountId: string;
    templateName: string;
    templateLanguage: string;
    phone: string;
    name: string | null;
    templateParams: string[];
  },
): Promise<{ conversationId: string; contactCreated: boolean }> {
  const resolved = await resolveConversationByPhone(
    db,
    params.accountId,
    params.phone,
    params.name,
  );
  await sendMessageToConversation(db, params.accountId, {
    conversationId: resolved.conversationId,
    messageType: 'template',
    templateName: params.templateName,
    templateLanguage: params.templateLanguage || 'en',
    templateParams: params.templateParams,
  });
  return {
    conversationId: resolved.conversationId,
    contactCreated: resolved.contactCreated,
  };
}

export { SendMessageError };
