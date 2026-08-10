import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  executeBroadcastSend,
  finalizeBroadcastStatus,
} from '@/lib/broadcasts/execute';

/**
 * POST /api/broadcasts/[id]/retry-failed
 *
 * Re-sends the template to recipients whose last attempt failed.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: broadcastId } = await params;
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
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();

    const accountId = profile?.account_id as string | undefined;
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      );
    }

    const role = profile?.account_role;
    if (role === 'viewer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: broadcast, error: bcErr } = await supabase
      .from('broadcasts')
      .select('id, status, account_id')
      .eq('id', broadcastId)
      .eq('account_id', accountId)
      .maybeSingle();

    if (bcErr || !broadcast) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
    }

    if (broadcast.status === 'sending') {
      return NextResponse.json(
        { error: 'Broadcast is still sending' },
        { status: 409 },
      );
    }

    const { count: failedCount } = await supabase
      .from('broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('broadcast_id', broadcastId)
      .eq('status', 'failed');

    if (!failedCount || failedCount === 0) {
      return NextResponse.json(
        { error: 'No failed recipients to retry' },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();

    await admin
      .from('broadcasts')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', broadcastId);

    const result = await executeBroadcastSend(admin, broadcastId, {
      onlyFailed: true,
    });

    await finalizeBroadcastStatus(admin, broadcastId);

    return NextResponse.json({
      success: true,
      retried: result.total,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (err) {
    console.error('[broadcasts/retry-failed]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Retry failed' },
      { status: 500 },
    );
  }
}
