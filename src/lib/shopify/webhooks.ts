import { getShopifyApiVersion, getShopifyAppUrl } from './config';
import { normalizeShopDomain } from './shop';

type ShopifyWebhook = {
  id: number | string;
  topic: string;
  address: string;
};

async function listWebhooks(
  domain: string,
  accessToken: string,
  version: string,
): Promise<ShopifyWebhook[]> {
  const res = await fetch(
    `https://${domain}/admin/api/${version}/webhooks.json?topic=orders%2Fcreate`,
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
      `[shopify] list webhooks failed (${res.status}): ${text.slice(0, 300)}`,
    );
    return [];
  }
  const data = (await res.json()) as { webhooks?: ShopifyWebhook[] };
  return data.webhooks ?? [];
}

async function deleteWebhook(
  domain: string,
  accessToken: string,
  version: string,
  id: number | string,
): Promise<void> {
  const res = await fetch(
    `https://${domain}/admin/api/${version}/webhooks/${id}.json`,
    {
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': accessToken },
    },
  );
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    console.warn(
      `[shopify] delete webhook ${id} failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
}

/**
 * Ensure exactly one orders/create webhook points at ReplyFlow.
 * Deletes duplicates from earlier Connect / reconnect attempts.
 */
export async function registerOrdersCreateWebhook(
  shop: string,
  accessToken: string,
): Promise<string | null> {
  const domain = normalizeShopDomain(shop);
  if (!domain) return null;

  const version = getShopifyApiVersion();
  const address = `${getShopifyAppUrl()}/api/shopify/webhook`;

  const existing = await listWebhooks(domain, accessToken, version);
  const ours = existing.filter(
    (w) =>
      w.topic === 'orders/create' &&
      w.address.replace(/\/$/, '') === address.replace(/\/$/, ''),
  );

  // Keep the oldest; remove extras so one order → one delivery.
  const [keep, ...extras] = ours;
  for (const w of extras) {
    await deleteWebhook(domain, accessToken, version, w.id);
  }

  if (keep) {
    return String(keep.id);
  }

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
