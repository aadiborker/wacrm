import { describe, expect, it } from "vitest";
import {
  normalizeTemplateCategory,
  parseDdMmYyyy,
  rangeToIsoBounds,
  tallyByCategory,
  tallyOutboundStatuses,
} from "./message-volume";

describe("parseDdMmYyyy", () => {
  it("parses valid dates", () => {
    expect(parseDdMmYyyy("01/09/2026")).toEqual({
      year: 2026,
      month: 9,
      day: 1,
    });
  });

  it("rejects invalid calendar dates", () => {
    expect(parseDdMmYyyy("31/02/2026")).toBeNull();
    expect(parseDdMmYyyy("2026-09-01")).toBeNull();
  });
});

describe("rangeToIsoBounds", () => {
  it("builds inclusive UTC bounds", () => {
    const r = rangeToIsoBounds("01/09/2026", "03/09/2026");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fromIso).toBe("2026-09-01T00:00:00.000Z");
    expect(r.toIso).toBe("2026-09-03T23:59:59.999Z");
  });

  it("rejects inverted range", () => {
    const r = rangeToIsoBounds("03/09/2026", "01/09/2026");
    expect(r.ok).toBe(false);
  });
});

describe("tallyOutboundStatuses", () => {
  it("counts statuses and delivered_or_read", () => {
    const t = tallyOutboundStatuses([
      { status: "sent" },
      { status: "delivered" },
      { status: "read" },
      { status: "failed" },
    ]);
    expect(t.total).toBe(4);
    expect(t.sent).toBe(1);
    expect(t.delivered).toBe(1);
    expect(t.read).toBe(1);
    expect(t.failed).toBe(1);
    expect(t.delivered_or_read).toBe(2);
  });
});

describe("normalizeTemplateCategory", () => {
  it("maps Meta categories and session messages", () => {
    expect(normalizeTemplateCategory("MARKETING", true)).toBe("Marketing");
    expect(normalizeTemplateCategory("Utility", true)).toBe("Utility");
    expect(normalizeTemplateCategory(null, false)).toBe("Session");
    expect(normalizeTemplateCategory(null, true)).toBe("Unknown");
  });
});

describe("tallyByCategory", () => {
  it("splits marketing vs utility vs session", () => {
    const b = tallyByCategory([
      { status: "delivered", template_name: "promo", category: "Marketing" },
      { status: "read", template_name: "order_update", category: "Utility" },
      { status: "sent", template_name: null, category: null },
      { status: "failed", template_name: "promo", category: "Marketing" },
    ]);
    expect(b.Marketing.total).toBe(2);
    expect(b.Marketing.delivered_or_read).toBe(1);
    expect(b.Marketing.failed).toBe(1);
    expect(b.Utility.total).toBe(1);
    expect(b.Utility.delivered_or_read).toBe(1);
    expect(b.Session.total).toBe(1);
  });
});
