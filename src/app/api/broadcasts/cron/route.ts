import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  claimScheduledBroadcast,
  executeBroadcastSend,
  finalizeBroadcastStatus,
} from '@/lib/broadcasts/execute';

/**
 * Drain due scheduled broadcasts. Hit on a schedule (cron / external
 * pinger) with `x-cron-secret` matching `AUTOMATION_CRON_SECRET`.
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }
  const supplied = request.headers.get('x-cron-secret') ?? '';
  const suppliedBuf = Buffer.from(supplied);
  const expectedBuf = Buffer.from(expected);
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  const { data: due, error } = await admin
    .from('broadcasts')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!due?.length) {
    return NextResponse.json({ processed: 0 });
  }

  let processed = 0;
  for (const row of due) {
    const id = row.id as string;
    const claimed = await claimScheduledBroadcast(admin, id);
    if (!claimed) continue;

    try {
      await executeBroadcastSend(admin, id);
      await finalizeBroadcastStatus(admin, id);
      processed++;
    } catch (err) {
      console.error('[broadcasts/cron] send failed:', id, err);
      await admin
        .from('broadcasts')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    }
  }

  return NextResponse.json({ processed });
}
