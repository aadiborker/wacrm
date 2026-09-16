// Shopify app env helpers (Dev Dashboard Client ID / Secret).

const DEFAULT_SCOPES =
  'read_orders,read_customers,read_checkouts,read_fulfillments';

export function getShopifyApiKey(): string {
  const key = process.env.SHOPIFY_API_KEY?.trim();
  if (!key) {
    throw new Error('SHOPIFY_API_KEY is not configured');
  }
  return key;
}

export function getShopifyApiSecret(): string {
  const secret = process.env.SHOPIFY_API_SECRET?.trim();
  if (!secret) {
    throw new Error('SHOPIFY_API_SECRET is not configured');
  }
  return secret;
}

export function getShopifyScopes(): string {
  return process.env.SHOPIFY_SCOPES?.trim() || DEFAULT_SCOPES;
}

/** Public origin for OAuth redirect + webhook address (no trailing slash). */
export function getShopifyAppUrl(): string {
  const url =
    process.env.SHOPIFY_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!url) {
    throw new Error(
      'SHOPIFY_APP_URL or NEXT_PUBLIC_SITE_URL must be set for Shopify OAuth',
    );
  }
  return url.replace(/\/$/, '');
}

export function getShopifyApiVersion(): string {
  return process.env.SHOPIFY_API_VERSION?.trim() || '2025-01';
}

export function isShopifyConfigured(): boolean {
  return Boolean(
    process.env.SHOPIFY_API_KEY?.trim() &&
      process.env.SHOPIFY_API_SECRET?.trim(),
  );
}
