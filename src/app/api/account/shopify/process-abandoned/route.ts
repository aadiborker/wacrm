// POST /api/account/shopify/process-abandoned
// Admin Settings button: send this company's due abandoned reminders now.

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { processDueAbandonedCheckouts } from '@/lib/shopify/abandoned';

export async function POST() {
  try {
    const ctx = await requireRole('admin');
    const result = await processDueAbandonedCheckouts(
      supabaseAdmin(),
      25,
      ctx.accountId,
    );
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
