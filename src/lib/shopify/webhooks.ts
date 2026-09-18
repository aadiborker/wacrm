import { getShopifyApiVersion, getShopifyAppUrl } from './config';
import { normalizeShopDomain } from './shop';

type ShopifyWebhook = {
  id: number | string;
  topic: string;
  address: string;
};

const WEBHOOK_TOPICS = [
  'orders/create',
  'orders/cancelled',
  'checkouts/create',
  'checkouts/update',
  'fulfillments/create',
  'fulfillment_events/create',
  'order_transactions/create',
] as const;

async function listWebhooksByTopic(
  domain: string,
  accessToken: string,
  version: string,
  topic: string,
): Promise<ShopifyWebhook[]> {
  const res = await fetch(
    `https://${domain}/admin/api/${version}/webhooks.json?topic=${encodeURIComponent(topic)}`,
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
      `[shopify] list webhooks ${topic} failed (${res.status}): ${text.slice(0, 300)}`,
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

async function ensureWebhook(
  domain: string,
  accessToken: string,
  version: string,
  topic: string,
  address: string,
): Promise<string | null> {
  const existing = await listWebhooksByTopic(
    domain,
    accessToken,
    version,
    topic,
  );
  const ours = existing.filter(
    (w) =>
      w.topic === topic &&
      w.address.replace(/\/$/, '') === address.replace(/\/$/, ''),
  );

  const [keep, ...extras] = ours;
  for (const w of extras) {
    await deleteWebhook(domain, accessToken, version, w.id);
  }
  if (keep) return String(keep.id);

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
        webhook: { topic, address, format: 'json' },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(
      `[shopify] register ${topic} failed (${res.status}): ${text.slice(0, 300)}`,
    );
    return null;
  }

  const data = (await res.json()) as {
    webhook?: { id?: number | string };
  };
  return data.webhook?.id != null ? String(data.webhook.id) : null;
}

/**
 * Ensure one webhook per topic pointing at ReplyFlow.
 * Returns the orders/create webhook id (stored on the connection row).
 */
export async function registerShopifyWebhooks(
  shop: string,
  accessToken: string,
): Promise<string | null> {
  const domain = normalizeShopDomain(shop);
  if (!domain) return null;

  const version = getShopifyApiVersion();
  const address = `${getShopifyAppUrl()}/api/shopify/webhook`;

  let ordersWebhookId: string | null = null;
  for (const topic of WEBHOOK_TOPICS) {
    const id = await ensureWebhook(
      domain,
      accessToken,
      version,
      topic,
      address,
    );
    if (topic === 'orders/create') ordersWebhookId = id;
  }
  return ordersWebhookId;
}

/** @deprecated use registerShopifyWebhooks */
export async function registerOrdersCreateWebhook(
  shop: string,
  accessToken: string,
): Promise<string | null> {
  return registerShopifyWebhooks(shop, accessToken);
}
