import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BillingBalanceError,
  fetchWhatsAppBillingBalance,
  mapCreditLineToBalance,
  pickWhatsAppCreditLine,
} from "./billing-balance";

describe("pickWhatsAppCreditLine", () => {
  it("prefers WHATSAPP_BUSINESS over other credit types", () => {
    const picked = pickWhatsAppCreditLine([
      {
        id: "1",
        credit_type: "ADS_BUSINESS",
        credit_available: { amount: "9.00", currency: "USD" },
      },
      {
        id: "2",
        credit_type: "WHATSAPP_BUSINESS",
        credit_available: { amount: "38.84", currency: "INR" },
      },
    ]);
    expect(picked?.id).toBe("2");
  });

  it("returns null when no lines", () => {
    expect(pickWhatsAppCreditLine([])).toBeNull();
  });
});

describe("mapCreditLineToBalance", () => {
  it("maps credit_available to BillingBalance", () => {
    const bal = mapCreditLineToBalance({
      id: "2",
      credit_type: "WHATSAPP_BUSINESS",
      credit_available: { amount: "38.84", currency: "INR" },
    });
    expect(bal.amount).toBe("38.84");
    expect(bal.currency).toBe("INR");
    expect(bal.source).toBe("extendedcredits.credit_available");
    expect(bal.tax_estimated).toBeNull();
    expect(bal.fetched_at).toMatch(/^\d{4}-/);
  });

  it("throws no_credit_line when credit_available missing", () => {
    expect(() =>
      mapCreditLineToBalance({
        id: "2",
        credit_type: "WHATSAPP_BUSINESS",
      }),
    ).toThrow(BillingBalanceError);
  });
});

describe("fetchWhatsAppBillingBalance", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves WABA owner business then extendedcredits", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "waba-1",
            currency: "INR",
            owner_business_info: { id: "biz-1", name: "Acme" },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "credit-1",
                credit_type: "WHATSAPP_BUSINESS",
                credit_available: { amount: "38.84", currency: "INR" },
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const result = await fetchWhatsAppBillingBalance({
      accessToken: "tok",
      wabaId: "waba-1",
    });
    expect(result.amount).toBe("38.84");
    expect(result.currency).toBe("INR");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    expect(firstUrl).toContain("/waba-1?");
    expect(firstUrl).toContain("owner_business_info");
  });

  it("maps Meta OAuth/permission errors to meta_permission", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: "(#200) Requires business_management", code: 200 },
        }),
        { status: 403 },
      ),
    );
    await expect(
      fetchWhatsAppBillingBalance({ accessToken: "tok", wabaId: "waba-1" }),
    ).rejects.toMatchObject({ code: "meta_permission" });
  });
});
