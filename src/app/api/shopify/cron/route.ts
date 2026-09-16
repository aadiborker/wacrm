// GET /api/shopify/cron — send due abandoned-checkout WhatsApp reminders.
// Auth: x-cron-secret === AUTOMATION_CRON_SECRET (same as other crons).

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { processDueAbandonedCheckouts } from '@/lib/shopify/abandoned';

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

  try {
    const result = await processDueAbandonedCheckouts(supabaseAdmin(), 25);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[shopify/cron]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
