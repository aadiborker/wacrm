// GET /api/shopify/install?shop=&template_name=&template_language=
// Starts Shopify OAuth for the logged-in admin's account.

import { NextResponse, type NextRequest } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isShopifyConfigured } from '@/lib/shopify/config';
import {
  SHOPIFY_OAUTH_COOKIE,
  buildAuthorizeUrl,
  createOAuthNonce,
  serializeOAuthState,
} from '@/lib/shopify/oauth';
import { normalizeShopDomain } from '@/lib/shopify/shop';

export async function GET(request: NextRequest) {
  try {
    if (!isShopifyConfigured()) {
      return NextResponse.json(
        { error: 'Shopify is not configured on this server' },
        { status: 503 },
      );
    }

    const ctx = await requireRole('admin');
    const { searchParams } = request.nextUrl;

    const shop = normalizeShopDomain(searchParams.get('shop') ?? '');
    if (!shop) {
      return NextResponse.json(
        {
          error:
            'Invalid shop. Use your-store.myshopify.com (or just your-store).',
        },
        { status: 400 },
      );
    }

    const orderTemplateName = (searchParams.get('template_name') ?? '').trim();
    if (!orderTemplateName) {
      return NextResponse.json(
        {
          error:
            'template_name is required (an approved WhatsApp template in this company).',
        },
        { status: 400 },
      );
    }

    const orderTemplateLanguage =
      (searchParams.get('template_language') ?? 'en').trim() || 'en';

    const nonce = createOAuthNonce();
    const authorizeUrl = buildAuthorizeUrl(shop, nonce);

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(
      SHOPIFY_OAUTH_COOKIE,
      serializeOAuthState({
        nonce,
        accountId: ctx.accountId,
        userId: ctx.userId,
        shop,
        orderTemplateName,
        orderTemplateLanguage,
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 10, // 10 minutes
      },
    );

    return response;
  } catch (err) {
    return toErrorResponse(err);
  }
}
