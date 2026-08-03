import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import {
  resolveFallbackPolicy,
  resolveIdleTimeoutMinutes,
} from '@/lib/flows/fallback'

/**
 * Sweep abandoned active flow runs.
 *
 * Cutoff is `fallback_policy.on_idle_minutes` when set, otherwise
 * `on_timeout_hours` (default 24h) converted to minutes. Past-cutoff
 * runs become `timed_out`, which frees
 * `idx_one_active_run_per_contact` so the customer can trigger the
 * flow again (e.g. by sending a keyword).
 *
 * Auth: `AUTOMATION_CRON_SECRET` via `x-cron-secret`.
 *
 * Schedule: prefer every 1–5 minutes when flows use short idle
 * timeouts; once per hour is fine if everything uses the 24h default.
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const now = new Date()

  const { data: runs, error } = await admin
    .from('flow_runs')
    .select(
      'id, flow_id, user_id, contact_id, last_advanced_at, flows ( fallback_policy )',
    )
    .eq('status', 'active')

  if (error) {
    console.error('[flows-cron] active-run scan failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!runs?.length) return NextResponse.json({ swept: 0 })

  type Row = {
    id: string
    flow_id: string
    user_id: string
    contact_id: string | null
    last_advanced_at: string
    flows: { fallback_policy: unknown } | { fallback_policy: unknown }[] | null
  }

  let swept = 0
  for (const r of runs as Row[]) {
    const flowsField = Array.isArray(r.flows) ? r.flows[0] : r.flows
    const policy = resolveFallbackPolicy(flowsField?.fallback_policy ?? null)
    const idleMinutes = resolveIdleTimeoutMinutes(policy)
    const lastAdvanced = new Date(r.last_advanced_at)
    const ageMinutes =
      (now.getTime() - lastAdvanced.getTime()) / (1000 * 60)
    if (ageMinutes < idleMinutes) continue

    const { data: updated } = await admin
      .from('flow_runs')
      .update({
        status: 'timed_out',
        ended_at: now.toISOString(),
        end_reason: 'stale_sweep',
      })
      .eq('id', r.id)
      .eq('status', 'active')
      .select('id')

    if (Array.isArray(updated) && updated.length > 0) {
      await admin.from('flow_run_events').insert({
        flow_run_id: r.id,
        event_type: 'timeout',
        payload: {
          age_minutes: Math.round(ageMinutes * 10) / 10,
          policy_minutes: idleMinutes,
          on_idle_minutes: policy.on_idle_minutes,
          on_timeout_hours: policy.on_timeout_hours,
        },
      })
      swept += 1
    }
  }

  return NextResponse.json({ swept })
}
