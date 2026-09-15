/**
 * Meta WhatsApp billing balance helpers.
 *
 * Starts from the account WABA ID (stored in whatsapp_config), then tries
 * WABA-scoped funding fields before falling back to Business extendedcredits
 * (BSP-only). Token never leaves the server.
 */

const META_API_VERSION = "v21.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
/** Keep under typical nginx/Cloudflare proxy limits so we return JSON, not HTML 502. */
const META_BILLING_FETCH_TIMEOUT_MS = 15_000;

export type BillingBalanceErrorCode =
  | "whatsapp_not_configured"
  | "token_decrypt_failed"
  | "meta_permission"
  | "meta_upstream"
  | "no_credit_line";

export class BillingBalanceError extends Error {
  readonly code: BillingBalanceErrorCode;
  constructor(code: BillingBalanceErrorCode, message: string) {
    super(message);
    this.name = "BillingBalanceError";
    this.code = code;
  }
}

export interface CurrencyAmount {
  amount?: string;
  currency?: string;
  amount_in_hundredths?: string;
}

export interface ExtendedCreditLine {
  id: string;
  credit_type?: string;
  balance?: CurrencyAmount;
  credit_available?: CurrencyAmount;
  max_balance?: CurrencyAmount;
}

export interface BillingBalance {
  amount: string;
  currency: string;
  fetched_at: string;
  source: string;
  tax_estimated: string | null;
}

export function pickWhatsAppCreditLine(
  lines: ExtendedCreditLine[],
): ExtendedCreditLine | null {
  if (!lines.length) return null;
  const wa = lines.find((l) => l.credit_type === "WHATSAPP_BUSINESS");
  return wa ?? lines[0] ?? null;
}

export function mapCreditLineToBalance(
  line: ExtendedCreditLine,
  currencyFallback?: string | null,
): BillingBalance {
  const available = line.credit_available;
  if (!available?.amount) {
    throw new BillingBalanceError(
      "no_credit_line",
      "Meta did not return a WhatsApp credit available balance for this business.",
    );
  }
  return {
    amount: available.amount,
    currency: available.currency || currencyFallback || "USD",
    fetched_at: new Date().toISOString(),
    source: "extendedcredits.credit_available",
    tax_estimated: null,
  };
}

/** Normalize Meta money fields that may be major units or hundredths. */
export function normalizeMetaAmount(
  amount: string | number | undefined | null,
  amountInHundredths?: string | number | null,
): string | null {
  if (amountInHundredths != null && amountInHundredths !== "") {
    const h = Number(amountInHundredths);
    if (Number.isFinite(h)) return (h / 100).toFixed(2);
  }
  if (amount == null || amount === "") return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  // Ad-account style balances are often in the smallest currency unit.
  if (Number.isInteger(n) && Math.abs(n) >= 100 && String(amount).indexOf(".") < 0) {
    return (n / 100).toFixed(2);
  }
  return Number.isInteger(n) && String(amount).indexOf(".") < 0
    ? n.toFixed(2)
    : String(amount);
}

/**
 * Pull a displayable balance from a funding / ad-account style Graph node.
 * Prefers STORED_BALANCE / credit_available style fields over "amount due".
 */
export function extractBalanceFromFundingNode(
  node: Record<string, unknown>,
  currencyFallback?: string | null,
  source = "waba.primary_funding_id",
): BillingBalance | null {
  const currency =
    (typeof node.currency === "string" && node.currency) ||
    currencyFallback ||
    "USD";

  const creditAvailable = node.credit_available as CurrencyAmount | undefined;
  if (creditAvailable?.amount) {
    const amount = normalizeMetaAmount(
      creditAvailable.amount,
      creditAvailable.amount_in_hundredths,
    );
    if (amount) {
      return {
        amount,
        currency: creditAvailable.currency || currency,
        fetched_at: new Date().toISOString(),
        source: `${source}.credit_available`,
        tax_estimated: null,
      };
    }
  }

  const details = node.funding_source_details;
  if (Array.isArray(details)) {
    for (const row of details) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      // TYPE 20 = STORED_BALANCE on Ads funding sources
      if (r.TYPE === 20 || r.type === 20 || r.TYPE === "STORED_BALANCE") {
        const amount = normalizeMetaAmount(
          (r.AMOUNT ?? r.AMOUNT ?? r.DISPLAY_AMOUNT) as string | number | undefined,
        );
        // DISPLAY_AMOUNT like "₹38.84" — strip currency symbols if needed
        if (typeof r.DISPLAY_AMOUNT === "string") {
          const m = r.DISPLAY_AMOUNT.replace(/[^\d.]/g, "");
          if (m) {
            return {
              amount: m,
              currency:
                (typeof r.CURRENCY === "string" && r.CURRENCY) || currency,
              fetched_at: new Date().toISOString(),
              source: `${source}.funding_source_details.stored_balance`,
              tax_estimated: null,
            };
          }
        }
        if (amount) {
          return {
            amount,
            currency: (typeof r.CURRENCY === "string" && r.CURRENCY) || currency,
            fetched_at: new Date().toISOString(),
            source: `${source}.funding_source_details.stored_balance`,
            tax_estimated: null,
          };
        }
      }
    }
  } else if (details && typeof details === "object") {
    const r = details as Record<string, unknown>;
    if (typeof r.DISPLAY_AMOUNT === "string") {
      const m = r.DISPLAY_AMOUNT.replace(/[^\d.]/g, "");
      if (m) {
        return {
          amount: m,
          currency: (typeof r.CURRENCY === "string" && r.CURRENCY) || currency,
          fetched_at: new Date().toISOString(),
          source: `${source}.funding_source_details`,
          tax_estimated: null,
        };
      }
    }
  }

  // Last resort: some nodes expose `amount` / `balance` as remaining prepaid.
  for (const key of ["available_balance", "remaining_balance", "amount"] as const) {
    const raw = node[key];
    const amount = normalizeMetaAmount(raw as string | number | undefined);
    if (amount) {
      return {
        amount,
        currency,
        fetched_at: new Date().toISOString(),
        source: `${source}.${key}`,
        tax_estimated: null,
      };
    }
  }

  return null;
}

interface MetaErrorBody {
  error?: { message?: string; code?: number; type?: string };
}

async function readMetaJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function throwFromMetaResponse(response: Response, body: unknown): never {
  const err = (body as MetaErrorBody | null)?.error;
  const message =
    err?.message || `Meta request failed with HTTP ${response.status}`;
  const permission =
    response.status === 401 ||
    response.status === 403 ||
    /permission|oauth|business_management|#10|#200|solution partner/i.test(
      message,
    );
  throw new BillingBalanceError(
    permission ? "meta_permission" : "meta_upstream",
    message,
  );
}

async function metaGet(
  url: string,
  accessToken: string,
): Promise<{ ok: true; body: unknown } | { ok: false; error: BillingBalanceError }> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(META_BILLING_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const message = err instanceof Error ? err.message : String(err);
    if (
      name === "TimeoutError" ||
      name === "AbortError" ||
      /aborted|timeout/i.test(message)
    ) {
      return {
        ok: false,
        error: new BillingBalanceError(
          "meta_upstream",
          "Meta billing request timed out. Try again, or check Meta Business billing directly.",
        ),
      };
    }
    return {
      ok: false,
      error: new BillingBalanceError(
        "meta_upstream",
        `Could not reach Meta: ${message}`,
      ),
    };
  }
  const body = await readMetaJson(response);
  if (!response.ok) {
    try {
      throwFromMetaResponse(response, body);
    } catch (e) {
      return { ok: false, error: e as BillingBalanceError };
    }
  }
  return { ok: true, body };
}

async function tryFundingIdBalance(args: {
  accessToken: string;
  fundingId: string;
  currencyFallback?: string | null;
}): Promise<BillingBalance | null> {
  const { accessToken, fundingId, currencyFallback } = args;
  const fieldSets = [
    "id,currency,credit_available,balance,amount,available_balance,funding_source_details",
    "id,currency,balance,amount_spent,is_prepay_account,funding_source_details",
  ];

  const idsToTry = [fundingId, `act_${fundingId.replace(/^act_/, "")}`];

  for (const id of idsToTry) {
    for (const fields of fieldSets) {
      const url = `${META_API_BASE}/${encodeURIComponent(id)}?fields=${fields}`;
      const res = await metaGet(url, accessToken);
      if (!res.ok) continue;
      const bal = extractBalanceFromFundingNode(
        (res.body ?? {}) as Record<string, unknown>,
        currencyFallback,
        id.startsWith("act_")
          ? "waba.primary_funding_id.ad_account"
          : "waba.primary_funding_id",
      );
      if (bal) return bal;
    }
  }
  return null;
}

export async function fetchWhatsAppBillingBalance(args: {
  accessToken: string;
  wabaId: string;
}): Promise<BillingBalance> {
  const { accessToken, wabaId } = args;

  // 1) Always start from WABA ID (per-company whatsapp_config.waba_id).
  const wabaUrl =
    `${META_API_BASE}/${encodeURIComponent(wabaId)}` +
    `?fields=name,currency,primary_funding_id,owner_business_info`;

  const wabaRes = await metaGet(wabaUrl, accessToken);
  if (!wabaRes.ok) throw wabaRes.error;

  const wabaBody = wabaRes.body as {
    currency?: string;
    primary_funding_id?: string;
    owner_business_info?: { id?: string };
  };

  // 2) Prefer WABA funding id — no BSP extendedcredits required.
  if (wabaBody.primary_funding_id) {
    const fromFunding = await tryFundingIdBalance({
      accessToken,
      fundingId: wabaBody.primary_funding_id,
      currencyFallback: wabaBody.currency ?? null,
    });
    if (fromFunding) return fromFunding;
  }

  // 3) Optional fallback: Business extendedcredits (often BSP-only → 403).
  const businessId = wabaBody.owner_business_info?.id;
  if (businessId) {
    const creditsUrl =
      `${META_API_BASE}/${encodeURIComponent(businessId)}/extendedcredits` +
      `?fields=id,credit_type,balance,credit_available,max_balance`;
    const creditsRes = await metaGet(creditsUrl, accessToken);
    if (creditsRes.ok) {
      const lines = ((creditsRes.body as { data?: ExtendedCreditLine[] })?.data ??
        []) as ExtendedCreditLine[];
      const picked = pickWhatsAppCreditLine(lines);
      if (picked?.credit_available?.amount) {
        return mapCreditLineToBalance(picked, wabaBody.currency ?? null);
      }
    } else if (
      creditsRes.error.code !== "meta_permission" &&
      !wabaBody.primary_funding_id
    ) {
      throw creditsRes.error;
    }
  }

  throw new BillingBalanceError(
    "meta_permission",
    wabaBody.primary_funding_id
      ? `WABA ${wabaId} resolved funding id ${wabaBody.primary_funding_id}, but Meta did not return a readable prepaid balance for this token. Prepaid "Current balance" in Business Suite is often not exposed on Cloud API for non–Solution Partner apps.`
      : `WABA ${wabaId} has no primary_funding_id and Meta blocked Business extendedcredits. Prepaid Current balance is not available via this WhatsApp token.`,
  );
}
