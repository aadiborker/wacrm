import { getShopifyApiVersion, getShopifyAppUrl } from './config';
import { normalizeShopDomain } from './shop';

export async function registerOrdersCreateWebhook(
  shop: string,
  accessToken: string,
): Promise<string | null> {
  const domain = normalizeShopDomain(shop);
  if (!domain) return null;

  const version = getShopifyApiVersion();
  const address = `${getShopifyAppUrl()}/api/shopify/webhook`;

  const res = await fetch(
    `https://${domain}/admin/api/${version}/webhooks.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        webhook: {
          topic: 'orders/create',
          address,
          format: 'json',
        },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // 422 often means the webhook already exists — not fatal for POC.
    console.warn(
      `[shopify] register webhook failed (${res.status}): ${text.slice(0, 300)}`,
    );
    return null;
  }

  const data = (await res.json()) as {
    webhook?: { id?: number | string };
  };
  const id = data.webhook?.id;
  return id != null ? String(id) : null;
}
