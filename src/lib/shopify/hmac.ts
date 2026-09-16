import crypto from 'crypto';

import { getShopifyApiSecret } from './config';

/** Verify Shopify webhook HMAC (base64 HMAC-SHA256 of raw body). */
export function verifyShopifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | null,
): boolean {
  if (!hmacHeader) return false;
  const digest = crypto
    .createHmac('sha256', getShopifyApiSecret())
    .update(rawBody, 'utf8')
    .digest('base64');

  try {
    const a = Buffer.from(digest);
    const b = Buffer.from(hmacHeader);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Verify OAuth callback `hmac` query param (Shopify docs). */
export function verifyShopifyOAuthHmac(
  query: Record<string, string | undefined>,
): boolean {
  const hmac = query.hmac;
  if (!hmac) return false;

  const message = Object.keys(query)
    .filter((k) => k !== 'hmac' && k !== 'signature' && query[k] != null)
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join('&');

  const digest = crypto
    .createHmac('sha256', getShopifyApiSecret())
    .update(message)
    .digest('hex');

  try {
    const a = Buffer.from(digest, 'hex');
    const b = Buffer.from(hmac, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
