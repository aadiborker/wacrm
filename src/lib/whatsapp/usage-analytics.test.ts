import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildConversationAnalyticsField,
  buildPricingAnalyticsField,
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

describe("field builders", () => {
  it("includes DAILY metrics", () => {
    expect(buildConversationAnalyticsField(1, 2)).toContain(
      "metric_types([CONVERSATION,COST])",
    );
    expect(buildPricingAnalyticsField(1, 2)).toContain(
      "metric_types([COST,VOLUME])",
    );
  });
});

describe("fetchWhatsAppUsageAnalytics", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aggregates conversation and pricing analytics from WABA", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "waba-1",
          conversation_analytics: {
            data: [
              {
                data_points: [
                  { start: 1, end: 2, conversation: 10, cost: 1.5 },
                  { start: 2, end: 3, conversation: 5, cost: 0.5 },
                ],
              },
            ],
          },
          pricing_analytics: {
            data: [
              {
                data_points: [
                  { start: 1, end: 2, volume: 100, cost: 2.0 },
                  { start: 2, end: 3, volume: 50, cost: 1.0 },
                ],
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const result = await fetchWhatsAppUsageAnalytics({
      accessToken: "tok",
      wabaId: "waba-1",
      days: 7,
    });

    expect(result.totals.conversations).toBe(15);
    expect(result.totals.conversation_cost).toBe(2);
    expect(result.totals.message_volume).toBe(150);
    expect(result.totals.pricing_cost).toBe(3);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("/waba-1?");
  });

  it("maps permission errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
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
