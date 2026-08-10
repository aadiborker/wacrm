import { supabaseAdmin } from '@/lib/automations/admin-client';
import { getContactById } from '@/lib/api/v1/contacts';
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver';
import type { WebhookEvent } from '@/lib/webhooks/events';

export interface ContactWebhookData {
  contact_id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  tags: { id: string; name: string; color: string }[];
  created_source: string | null;
}

async function buildContactPayload(
  accountId: string,
  contactId: string,
): Promise<ContactWebhookData | null> {
  const admin = supabaseAdmin();
  const contact = await getContactById(admin, accountId, contactId);
  if (!contact) return null;

  const { data: row } = await admin
    .from('contacts')
    .select('created_source')
    .eq('id', contactId)
    .eq('account_id', accountId)
    .maybeSingle();

  return {
    contact_id: contact.id,
    phone: contact.phone,
    name: contact.name,
    email: contact.email,
    company: contact.company,
    tags: contact.tags,
    created_source: (row?.created_source as string | null) ?? null,
  };
}

/**
 * Fire a contact lifecycle webhook. Best-effort — never throws.
 */
export async function dispatchContactWebhook(
  accountId: string,
  contactId: string,
  event: 'contact.created' | 'contact.updated',
): Promise<void> {
  try {
    const payload = await buildContactPayload(accountId, contactId);
    if (!payload) return;
    await dispatchWebhookEvent(
      supabaseAdmin(),
      accountId,
      event as WebhookEvent,
      payload,
    );
  } catch (err) {
    console.error('[contacts/webhook]', event, contactId, err);
  }
}
