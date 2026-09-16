// GET /api/shopify/callback — finish Shopify OAuth, save connection, register webhook.

import { NextResponse, type NextRequest } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { getShopifyAppUrl, isShopifyConfigured } from '@/lib/shopify/config';
import { verifyShopifyOAuthHmac } from '@/lib/shopify/hmac';
import {
  SHOPIFY_OAUTH_COOKIE,
  exchangeAccessToken,
  parseOAuthState,
} from '@/lib/shopify/oauth';
import { normalizeShopDomain } from '@/lib/shopify/shop';
import { registerOrdersCreateWebhook } from '@/lib/shopify/webhooks';
import { encrypt } from '@/lib/whatsapp/encryption';

function settingsRedirect(query: Record<string, string>): NextResponse {
  const base = getShopifyAppUrl();
  const url = new URL(`${base}/settings`);
  url.searchParams.set('tab', 'integrations');
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  const res = NextResponse.redirect(url);
  res.cookies.set(SHOPIFY_OAUTH_COOKIE, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return res;
}

export async function GET(request: NextRequest) {
  try {
    if (!isShopifyConfigured()) {
      return settingsRedirect({ shopify: 'error', reason: 'not_configured' });
    }

    const { searchParams } = request.nextUrl;
    const query: Record<string, string | undefined> = {};
    searchParams.forEach((value, key) => {
      query[key] = value;
    });

    if (!verifyShopifyOAuthHmac(query)) {
      return settingsRedirect({ shopify: 'error', reason: 'bad_hmac' });
    }

    const shop = normalizeShopDomain(searchParams.get('shop') ?? '');
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (!shop || !code || !state) {
      return settingsRedirect({ shopify: 'error', reason: 'missing_params' });
    }

    const cookieRaw = request.cookies.get(SHOPIFY_OAUTH_COOKIE)?.value;
    const oauthState = parseOAuthState(cookieRaw);
    if (!oauthState || oauthState.nonce !== state) {
      return settingsRedirect({ shopify: 'error', reason: 'bad_state' });
    }
    if (oauthState.shop !== shop) {
      return settingsRedirect({ shopify: 'error', reason: 'shop_mismatch' });
    }

    const { accessToken, scope } = await exchangeAccessToken(shop, code);
    const webhookId = await registerOrdersCreateWebhook(shop, accessToken);

    const db = supabaseAdmin();
    const now = new Date().toISOString();

    // Reject if this shop is already tied to a different account.
    const { data: existingShop } = await db
      .from('shopify_connections')
      .select('id, account_id')
      .eq('shop_domain', shop)
      .maybeSingle();

    if (existingShop && existingShop.account_id !== oauthState.accountId) {
      return settingsRedirect({ shopify: 'error', reason: 'shop_taken' });
    }

    // One shop per account for POC — replace any prior connection.
    const { error } = await db.from('shopify_connections').upsert(
      {
        account_id: oauthState.accountId,
        shop_domain: shop,
        access_token: encrypt(accessToken),
        scope,
        order_template_name: oauthState.orderTemplateName,
        order_template_language: oauthState.orderTemplateLanguage,
        webhook_id: webhookId,
        installed_by: oauthState.userId,
        updated_at: now,
      },
      { onConflict: 'account_id' },
    );

    if (error) {
      console.error('[shopify/callback] upsert error:', error);
      return settingsRedirect({ shopify: 'error', reason: 'db' });
    }

    return settingsRedirect({ shopify: 'connected' });
  } catch (err) {
    console.error('[shopify/callback]', err);
    return settingsRedirect({ shopify: 'error', reason: 'exception' });
  }
}
