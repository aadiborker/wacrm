import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { decrypt } from "@/lib/whatsapp/encryption";
import {
  UsageAnalyticsError,
  fetchWhatsAppUsageAnalytics,
} from "@/lib/whatsapp/usage-analytics";

/**
 * GET /api/meta/usage-analytics?days=7
 *
 * Live Meta conversation + pricing analytics for the caller's WABA.
 * Admin+ only. Never returns the access token.
 */
export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole("admin");

    const url = new URL(request.url);
    const rawDays = Number(url.searchParams.get("days"));
    const days =
      Number.isFinite(rawDays) && rawDays >= 1
        ? Math.min(90, Math.floor(rawDays))
        : 7;

    const { data: config, error } = await supabase
      .from("whatsapp_config")
      .select("waba_id, access_token")
      .eq("account_id", accountId)
      .maybeSingle();

    if (error) {
      console.error("[meta/usage-analytics] config fetch:", error);
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
      console.error("[meta/usage-analytics] token decrypt failed:", err);
      return NextResponse.json(
        {
          error:
            "Stored access token cannot be decrypted. Re-save the WhatsApp token in Settings.",
          code: "token_decrypt_failed",
        },
        { status: 400 },
      );
    }

    try {
      const data = await fetchWhatsAppUsageAnalytics({
        accessToken,
        wabaId: config.waba_id,
        days,
      });
      return NextResponse.json({ data });
    } catch (err) {
      if (err instanceof UsageAnalyticsError) {
        if (
          err.code === "meta_permission" ||
          err.code === "empty"
        ) {
          return NextResponse.json({
            data: null,
            unavailable: {
              code: err.code,
              message: err.message,
              waba_id: config.waba_id,
            },
          });
        }
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: 424 },
        );
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
