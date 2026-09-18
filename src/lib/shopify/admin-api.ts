import { getShopifyApiVersion } from './config';
import { normalizeShopDomain } from './shop';

export async function fetchShopifyOrder(
  shop: string,
  accessToken: string,
  orderId: string | number,
): Promise<Record<string, unknown> | null> {
  const domain = normalizeShopDomain(shop);
  if (!domain) return null;

  const version = getShopifyApiVersion();
  const res = await fetch(
    `https://${domain}/admin/api/${version}/orders/${orderId}.json`,
    {
      headers: {
        Accept: 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(
      `[shopify] fetch order ${orderId} failed (${res.status}): ${text.slice(0, 200)}`,
    );
    return null;
  }

  const data = (await res.json()) as { order?: Record<string, unknown> };
  return data.order ?? null;
}
