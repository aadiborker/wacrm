import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildConversationAnalyticsUrl,
  buildPricingAnalyticsUrl,
  fetchWhatsAppUsageAnalytics,
  flattenAnalyticsDataPoints,
  sumNumericField,
} from "./usage-analytics";

describe("sumNumericField", () => {
  it("sums finite numbers and ignores junk", () => {
    expect(
      sumNumericField(
        [{ conversation: 2 }, { conversation: "3" }, { conversation: "x" }],
        "conversation",
      ),
    ).toBe(5);
  });
});

describe("flattenAnalyticsDataPoints", () => {
  it("flattens nested data_points", () => {
    const points = flattenAnalyticsDataPoints({
      data: [
        {
          data_points: [
            { conversation: 1, cost: 0.1 },
            { conversation: 2, cost: 0.2 },
          ],
        },
      ],
    });
    expect(points).toHaveLength(2);
    expect(sumNumericField(points, "conversation")).toBe(3);
  });
});

describe("URL builders", () => {
  it("uses analytics edges without metric_types", () => {
    const conv = buildConversationAnalyticsUrl("waba-1", 100, 200);
    expect(conv).toContain("/waba-1/conversation_analytics?");
    expect(conv).toContain("granularity=DAILY");
    expect(conv).not.toContain("metric_types");

    const pricing = buildPricingAnalyticsUrl("waba-1", 100, 200);
    expect(pricing).toContain("/waba-1/pricing_analytics?");
    expect(pricing).not.toContain("metric_types");
  });
});

describe("fetchWhatsAppUsageAnalytics", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aggregates conversation and pricing analytics from WABA edges", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("conversation_analytics")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data_points: [
                  { start: 1, end: 2, conversation: 10, cost: 1.5 },
                  { start: 2, end: 3, conversation: 5, cost: 0.5 },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              data_points: [
                { start: 1, end: 2, volume: 100, cost: 2.0 },
                { start: 2, end: 3, volume: 50, cost: 1.0 },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    });

    const result = await fetchWhatsAppUsageAnalytics({
      accessToken: "tok",
      wabaId: "waba-1",
      days: 7,
    });

    expect(result.totals.conversations).toBe(15);
    expect(result.totals.conversation_cost).toBe(2);
    expect(result.totals.message_volume).toBe(150);
    expect(result.totals.pricing_cost).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps permission errors when both edges fail", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: "(#200) Requires permission", code: 200 },
        }),
        { status: 403 },
      ),
    );
    await expect(
      fetchWhatsAppUsageAnalytics({
        accessToken: "tok",
        wabaId: "waba-1",
      }),
    ).rejects.toMatchObject({ code: "meta_permission" });
  });
});
