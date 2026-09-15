import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BillingBalanceError,
  extractBalanceFromFundingNode,
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

describe("extractBalanceFromFundingNode", () => {
  it("reads DISPLAY_AMOUNT from STORED_BALANCE funding details", () => {
    const bal = extractBalanceFromFundingNode(
      {
        currency: "INR",
        funding_source_details: [
          { TYPE: 20, DISPLAY_AMOUNT: "₹38.84", CURRENCY: "INR" },
        ],
      },
      "INR",
    );
    expect(bal?.amount).toBe("38.84");
    expect(bal?.currency).toBe("INR");
    expect(bal?.source).toContain("stored_balance");
  });
});

describe("fetchWhatsAppBillingBalance", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses WABA primary_funding_id before extendedcredits", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "waba-1",
            currency: "INR",
            primary_funding_id: "fund-9",
            owner_business_info: { id: "biz-1", name: "Acme" },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "fund-9",
            currency: "INR",
            funding_source_details: [
              { TYPE: 20, DISPLAY_AMOUNT: "₹38.84", CURRENCY: "INR" },
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
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    expect(firstUrl).toContain("/waba-1?");
    expect(firstUrl).toContain("primary_funding_id");
    const secondUrl = String(fetchMock.mock.calls[1][0]);
    expect(secondUrl).toContain("/fund-9?");
  });

  it("falls back to extendedcredits when funding id has no balance", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/waba-1?")) {
        return new Response(
          JSON.stringify({
            id: "waba-1",
            currency: "INR",
            primary_funding_id: "fund-9",
            owner_business_info: { id: "biz-1" },
          }),
          { status: 200 },
        );
      }
      if (url.includes("extendedcredits")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "credit-1",
                credit_type: "WHATSAPP_BUSINESS",
                credit_available: { amount: "12.00", currency: "INR" },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    });

    const result = await fetchWhatsAppBillingBalance({
      accessToken: "tok",
      wabaId: "waba-1",
    });
    expect(result.amount).toBe("12.00");
    expect(result.source).toBe("extendedcredits.credit_available");
  });

  it("maps Meta OAuth/permission errors on WABA lookup to meta_permission", async () => {
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
