import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  executeBroadcastSend,
  finalizeBroadcastStatus,
} from '@/lib/broadcasts/execute';
import { recipientMatchesErrorCode } from '@/lib/broadcasts/error-summary';

/**
 * POST /api/broadcasts/[id]/retry-failed
 *
 * Re-sends the template to recipients whose last attempt failed.
 * Optional body: `{ "errorCode": "131026" }` retries only that Meta reason.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: broadcastId } = await params;
    const supabase = await createClient();

    const body = (await request.json().catch(() => null)) as {
      errorCode?: string;
    } | null;
    const errorCode =
      typeof body?.errorCode === 'string' && body.errorCode.trim()
        ? body.errorCode.trim()
        : undefined;

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

    const { data: failedRows, error: failedErr } = await supabase
      .from('broadcast_recipients')
      .select('id, error_message')
      .eq('broadcast_id', broadcastId)
      .eq('status', 'failed');

    if (failedErr) {
      return NextResponse.json(
        { error: 'Failed to load failed recipients' },
        { status: 500 },
      );
    }

    let recipientIds = (failedRows ?? []).map((r) => r.id as string);

    if (errorCode) {
      recipientIds = (failedRows ?? [])
        .filter((r) =>
          recipientMatchesErrorCode(
            {
              status: 'failed',
              error_message: r.error_message as string | null,
            },
            errorCode,
          ),
        )
        .map((r) => r.id as string);
    }

    if (recipientIds.length === 0) {
      return NextResponse.json(
        {
          error: errorCode
            ? 'No failed recipients match that error code'
            : 'No failed recipients to retry',
        },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();

    await admin
      .from('broadcasts')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', broadcastId);

    const result = await executeBroadcastSend(admin, broadcastId, {
      recipientIds,
    });

    await finalizeBroadcastStatus(admin, broadcastId);

    return NextResponse.json({
      success: true,
      retried: result.total,
      sent: result.sent,
      failed: result.failed,
      errorCode: errorCode ?? null,
    });
  } catch (err) {
    console.error('[broadcasts/retry-failed]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Retry failed' },
      { status: 500 },
    );
  }
}
