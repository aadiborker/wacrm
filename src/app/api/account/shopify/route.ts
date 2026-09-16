// GET / DELETE / PATCH /api/account/shopify — connection status for Settings.

import { NextResponse } from 'next/server';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { isShopifyConfigured } from '@/lib/shopify/config';
import { registerShopifyWebhooks } from '@/lib/shopify/webhooks';
import { decrypt } from '@/lib/whatsapp/encryption';

const PUBLIC_COLUMNS =
  'id, shop_domain, scope, order_template_name, order_template_language, abandoned_template_name, abandoned_template_language, abandoned_delay_hours, webhook_id, created_at, updated_at';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const { data, error } = await ctx.supabase
      .from('shopify_connections')
      .select(PUBLIC_COLUMNS)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (error) {
      console.error('[GET /api/account/shopify]', error);
      return NextResponse.json(
        { error: 'Failed to load Shopify connection' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      configured: isShopifyConfigured(),
      connection: data ?? null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body?.order_template_name === 'string') {
      const name = body.order_template_name.trim();
      if (!name) {
        return NextResponse.json(
          { error: 'order_template_name cannot be empty' },
          { status: 400 },
        );
      }
      patch.order_template_name = name;
    }
    if (typeof body?.order_template_language === 'string') {
      const lang = body.order_template_language.trim();
      if (!lang) {
        return NextResponse.json(
          { error: 'order_template_language cannot be empty' },
          { status: 400 },
        );
      }
      patch.order_template_language = lang;
    }
    if (typeof body?.abandoned_template_name === 'string') {
      const name = body.abandoned_template_name.trim();
      patch.abandoned_template_name = name || null;
    }
    if (typeof body?.abandoned_template_language === 'string') {
      const lang = body.abandoned_template_language.trim();
      if (!lang) {
        return NextResponse.json(
          { error: 'abandoned_template_language cannot be empty' },
          { status: 400 },
        );
      }
      patch.abandoned_template_language = lang;
    }
    if (typeof body?.abandoned_delay_hours === 'number') {
      const hours = Math.floor(body.abandoned_delay_hours);
      if (hours < 0 || hours > 168) {
        return NextResponse.json(
          { error: 'abandoned_delay_hours must be 0–168' },
          { status: 400 },
        );
      }
      patch.abandoned_delay_hours = hours;
    } else if (
      typeof body?.abandoned_delay_hours === 'string' &&
      body.abandoned_delay_hours.trim() !== ''
    ) {
      const hours = Math.floor(Number(body.abandoned_delay_hours));
      if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
        return NextResponse.json(
          { error: 'abandoned_delay_hours must be 0–168' },
          { status: 400 },
        );
      }
      patch.abandoned_delay_hours = hours;
    }

    const reregisterWebhooks = body?.reregister_webhooks === true;

    if (Object.keys(patch).length === 1 && !reregisterWebhooks) {
      return NextResponse.json(
        { error: 'Nothing to update' },
        { status: 400 },
      );
    }

    if (reregisterWebhooks && isShopifyConfigured()) {
      const admin = supabaseAdmin();
      const { data: secretRow } = await admin
        .from('shopify_connections')
        .select('shop_domain, access_token')
        .eq('account_id', ctx.accountId)
        .maybeSingle();
      if (secretRow?.shop_domain && secretRow.access_token) {
        try {
          const token = decrypt(secretRow.access_token as string);
          const webhookId = await registerShopifyWebhooks(
            secretRow.shop_domain as string,
            token,
          );
          if (webhookId) patch.webhook_id = webhookId;
        } catch (err) {
          console.warn('[PATCH /api/account/shopify] reregister failed:', err);
        }
      }
    }

    const { data, error } = await ctx.supabase
      .from('shopify_connections')
      .update(patch)
      .eq('account_id', ctx.accountId)
      .select(PUBLIC_COLUMNS)
      .maybeSingle();

    if (error) {
      console.error('[PATCH /api/account/shopify]', error);
      return NextResponse.json(
        { error: 'Failed to update Shopify connection' },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: 'No Shopify connection for this company' },
        { status: 404 },
      );
    }

    return NextResponse.json({ connection: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE() {
  try {
    const ctx = await requireRole('admin');

    const { error } = await ctx.supabase
      .from('shopify_connections')
      .delete()
      .eq('account_id', ctx.accountId);

    if (error) {
      console.error('[DELETE /api/account/shopify]', error);
      return NextResponse.json(
        { error: 'Failed to disconnect Shopify' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
