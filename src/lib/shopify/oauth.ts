import crypto from 'crypto';

import {
  getShopifyApiKey,
  getShopifyApiSecret,
  getShopifyAppUrl,
  getShopifyScopes,
} from './config';
import { normalizeShopDomain } from './shop';

export const SHOPIFY_OAUTH_COOKIE = 'shopify_oauth';

export interface ShopifyOAuthState {
  nonce: string;
  accountId: string;
  userId: string;
  shop: string;
  orderTemplateName: string;
  orderTemplateLanguage: string;
}

export function createOAuthNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function buildAuthorizeUrl(shop: string, nonce: string): string {
  const domain = normalizeShopDomain(shop);
  if (!domain) {
    throw new Error('Invalid shop domain');
  }

  const redirectUri = `${getShopifyAppUrl()}/api/shopify/callback`;
  const params = new URLSearchParams({
    client_id: getShopifyApiKey(),
    scope: getShopifyScopes(),
    redirect_uri: redirectUri,
    state: nonce,
  });

  return `https://${domain}/admin/oauth/authorize?${params.toString()}`;
}

export async function exchangeAccessToken(
  shop: string,
  code: string,
): Promise<{ accessToken: string; scope: string }> {
  const domain = normalizeShopDomain(shop);
  if (!domain) {
    throw new Error('Invalid shop domain');
  }

  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: getShopifyApiKey(),
      client_secret: getShopifyApiSecret(),
      code,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Shopify token exchange failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as {
    access_token?: string;
    scope?: string;
  };
  if (!data.access_token) {
    throw new Error('Shopify token exchange returned no access_token');
  }

  return {
    accessToken: data.access_token,
    scope: data.scope ?? '',
  };
}

export function serializeOAuthState(state: ShopifyOAuthState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

export function parseOAuthState(raw: string | undefined): ShopifyOAuthState | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<ShopifyOAuthState>;
    if (
      typeof parsed.nonce !== 'string' ||
      typeof parsed.accountId !== 'string' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.shop !== 'string' ||
      typeof parsed.orderTemplateName !== 'string' ||
      typeof parsed.orderTemplateLanguage !== 'string'
    ) {
      return null;
    }
    return parsed as ShopifyOAuthState;
  } catch {
    return null;
  }
}
