/**
 * Meta WhatsApp billing balance helpers.
 *
 * Maps Extended Credits `credit_available` for WHATSAPP_BUSINESS lines
 * to the Reports "Current balance" card. Token never leaves the server.
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
    /permission|oauth|business_management|#10|#200/i.test(message);
  throw new BillingBalanceError(
    permission ? "meta_permission" : "meta_upstream",
    message,
  );
}

async function metaGet(url: string, accessToken: string): Promise<unknown> {
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
      throw new BillingBalanceError(
        "meta_upstream",
        "Meta billing request timed out. Try again, or check Meta Business billing directly.",
      );
    }
    throw new BillingBalanceError(
      "meta_upstream",
      `Could not reach Meta: ${message}`,
    );
  }
  const body = await readMetaJson(response);
  if (!response.ok) throwFromMetaResponse(response, body);
  return body;
}

export async function fetchWhatsAppBillingBalance(args: {
  accessToken: string;
  wabaId: string;
}): Promise<BillingBalance> {
  const { accessToken, wabaId } = args;
  const wabaUrl =
    `${META_API_BASE}/${encodeURIComponent(wabaId)}` +
    `?fields=owner_business_info,currency,primary_funding_id`;

  const wabaBody = (await metaGet(wabaUrl, accessToken)) as {
    currency?: string;
    owner_business_info?: { id?: string };
  };

  const businessId = wabaBody.owner_business_info?.id;
  if (!businessId) {
    throw new BillingBalanceError(
      "meta_permission",
      "Could not resolve Meta Business ID from this WhatsApp account. The access token may lack business permissions.",
    );
  }

  const creditsUrl =
    `${META_API_BASE}/${encodeURIComponent(businessId)}/extendedcredits` +
    `?fields=id,credit_type,balance,credit_available,max_balance`;

  const creditsBody = (await metaGet(creditsUrl, accessToken)) as {
    data?: ExtendedCreditLine[];
  };

  const lines = (creditsBody.data ?? []) as ExtendedCreditLine[];
  const picked = pickWhatsAppCreditLine(lines);
  if (!picked) {
    throw new BillingBalanceError(
      "no_credit_line",
      "No Meta extended credit line found for this business.",
    );
  }
  return mapCreditLineToBalance(picked, wabaBody.currency ?? null);
}
