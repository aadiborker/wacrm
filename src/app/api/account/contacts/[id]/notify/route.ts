import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { dispatchContactWebhook } from '@/lib/contacts/webhook-dispatch';

/**
 * POST /api/account/contacts/[id]/notify
 *
 * Fire a contact lifecycle webhook after a dashboard-side create/update.
 * The contact row is already saved via the Supabase client; this route
 * only dispatches the outbound event.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contactId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const accountId = profile?.account_id as string | undefined;
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      event?: unknown;
    } | null;

    const event = body?.event;
    if (event !== 'contact.created' && event !== 'contact.updated') {
      return NextResponse.json(
        { error: "'event' must be contact.created or contact.updated" },
        { status: 400 },
      );
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .eq('account_id', accountId)
      .maybeSingle();

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    await dispatchContactWebhook(accountId, contactId, event);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[account/contacts/notify]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Notify failed' },
      { status: 500 },
    );
  }
}
