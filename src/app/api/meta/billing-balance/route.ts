import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { decrypt } from "@/lib/whatsapp/encryption";
import {
  BillingBalanceError,
  fetchWhatsAppBillingBalance,
} from "@/lib/whatsapp/billing-balance";

/**
 * GET /api/meta/billing-balance
 *
 * Live Meta WhatsApp current balance for the caller's account.
 * Admin+ only. Never returns the access token.
 */
export async function GET() {
  try {
    const { supabase, accountId } = await requireRole("admin");

    const { data: config, error } = await supabase
      .from("whatsapp_config")
      .select("waba_id, access_token")
      .eq("account_id", accountId)
      .maybeSingle();

    if (error) {
      console.error("[meta/billing-balance] config fetch:", error);
      return NextResponse.json(
        { error: "Failed to load WhatsApp configuration", code: "internal" },
        { status: 500 },
      );
    }

    if (!config?.waba_id || !config.access_token) {
      return NextResponse.json(
        {
          error:
            "WhatsApp is not fully configured. Add WABA ID and access token in Settings → WhatsApp.",
          code: "whatsapp_not_configured",
        },
        { status: 400 },
      );
    }

    let accessToken: string;
    try {
      accessToken = decrypt(config.access_token);
    } catch (err) {
      console.error("[meta/billing-balance] token decrypt failed:", err);
      return NextResponse.json(
        {
          error:
            "Stored access token cannot be decrypted. Re-save the WhatsApp token in Settings.",
          code: "token_decrypt_failed",
        },
        { status: 400 },
      );
    }

    const data = await fetchWhatsAppBillingBalance({
      accessToken,
      wabaId: config.waba_id,
    });

    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof BillingBalanceError) {
      // Meta often cannot expose prepaid wallet balance on Cloud API.
      // Return 200 + unavailable so the UI is not confused with auth 403.
      if (
        err.code === "meta_permission" ||
        err.code === "no_credit_line"
      ) {
        const raw = err.message;
        const friendly =
          /solution provider|solution partner|do not have permission/i.test(
            raw,
          )
            ? `Meta does not expose prepaid Current balance for this WhatsApp account through Cloud API. Open Meta Business Billing to view the live balance.`
            : raw;
        return NextResponse.json({
          data: null,
          unavailable: {
            code: err.code,
            message: friendly,
            ...(err.details ?? { waba_id: undefined }),
          },
        });
      }
      const status = 424;
      return NextResponse.json(
        { error: err.message, code: err.code, ...(err.details ?? {}) },
        { status },
      );
    }
    return toErrorResponse(err);
  }
}
