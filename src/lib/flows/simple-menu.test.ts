import { describe, expect, it } from "vitest";
import {
  buildSimpleMenuFlow,
  inferSimpleMenuSpecFromNodes,
  validateSimpleMenuSpec,
  type SimpleMenuSpec,
} from "./simple-menu";

const valid: SimpleMenuSpec = {
  name: "Shop menu",
  keyword: "Help",
  welcomeText: "Welcome! How can we help?",
  buttonLabel: "View options",
  options: [
    {
      title: "Talk to team",
      action: "handoff",
      handoffNote: "Wants an agent",
    },
    {
      title: "Browse lights",
      action: "submenu",
      submenuBody: "What are you looking for?",
      submenuOptions: [
        {
          title: "LED bulbs",
          action: "message",
          messageText: "Great — we stock LED bulbs in several watts.",
          handoffNote: "Interested in LED bulbs",
        },
        { title: "Fans", action: "handoff", handoffNote: "Fans" },
      ],
    },
  ],
};

describe("validateSimpleMenuSpec", () => {
  it("accepts a valid shop menu", () => {
    expect(validateSimpleMenuSpec(valid)).toEqual([]);
  });

  it("flags titles over 24 chars", () => {
    const issues = validateSimpleMenuSpec({
      ...valid,
      options: [
        {
          title: "Bulk / wholesale purchase!",
          action: "handoff",
        },
      ],
    });
    expect(issues.some((i) => i.field.includes("title"))).toBe(true);
  });

  it("requires submenu children", () => {
    const issues = validateSimpleMenuSpec({
      ...valid,
      options: [
        {
          title: "Browse",
          action: "submenu",
          submenuBody: "Pick one",
          submenuOptions: [],
        },
      ],
    });
    expect(issues.some((i) => i.field.includes("submenuOptions"))).toBe(true);
  });
});

describe("buildSimpleMenuFlow", () => {
  it("builds start → main list → handoff/submenu graph", () => {
    const built = buildSimpleMenuFlow(valid);
    expect(built.entry_node_id).toBe("start");
    expect(built.trigger_config.keywords).toEqual(["Help"]);
    const keys = built.nodes.map((n) => n.node_key);
    expect(keys).toContain("start");
    expect(keys).toContain("menu_main");
    expect(keys).toContain("menu_sub_1");
    expect(keys).toContain("handoff_0");
    expect(keys).toContain("msg_sub_1_0");
    expect(keys).not.toContain("end");

    const main = built.nodes.find((n) => n.node_key === "menu_main");
    expect(main?.node_type).toBe("send_list");
    const cfg = main?.config as {
      sections: Array<{ rows: Array<{ next_node_key: string }> }>;
    };
    expect(cfg.sections[0].rows).toHaveLength(2);
  });

  it("supports nested submenu and end on leaf choices", () => {
    const built = buildSimpleMenuFlow({
      name: "Nested",
      keyword: "Hi",
      welcomeText: "Welcome",
      options: [
        {
          title: "Browse",
          action: "submenu",
          submenuBody: "Products?",
          submenuOptions: [
            {
              title: "iPhones",
              action: "submenu",
              submenuBody: "Usage?",
              submenuOptions: [
                { title: "For home", action: "handoff" },
                { title: "Done", action: "end" },
              ],
            },
          ],
        },
      ],
    });
    const keys = built.nodes.map((n) => n.node_key);
    expect(keys).toContain("menu_sub_0");
    expect(keys.some((k) => k.startsWith("menu_sub_0_"))).toBe(true);
    expect(keys).toContain("end");
  });

  it("round-trips through inferSimpleMenuSpecFromNodes for legacy drafts", () => {
    const built = buildSimpleMenuFlow(valid);
    // Simulate a legacy save without simple_menu_spec.
    const { simple_menu_spec: _drop, ...trigger } = built.trigger_config as {
      keywords: string[];
      match_type: string;
      simple_menu_spec?: unknown;
    };
    void _drop;
    const inferred = inferSimpleMenuSpecFromNodes(
      { name: built.name, trigger_config: trigger },
      built.nodes.map((n) => ({
        node_key: n.node_key,
        node_type: n.node_type,
        config: n.config as Record<string, unknown>,
      })),
    );
    expect(inferred).not.toBeNull();
    expect(inferred!.name).toBe("Shop menu");
    expect(inferred!.keyword).toBe("Help");
    expect(inferred!.welcomeText).toBe("Welcome! How can we help?");
    expect(inferred!.options).toHaveLength(2);
    expect(inferred!.options[0]!.action).toBe("handoff");
    expect(inferred!.options[1]!.action).toBe("submenu");
    expect(inferred!.options[1]!.submenuOptions).toHaveLength(2);
  });

  it("emits image then message with buy link for product choices", () => {
    const built = buildSimpleMenuFlow({
      name: "Choco",
      keyword: "shop",
      welcomeText: "Pick a category",
      options: [
        {
          title: "Premium",
          action: "submenu",
          submenuBody: "Pick a chocolate",
          submenuOptions: [
            {
              title: "Funtan",
              action: "message",
              messageText: "Rich premium chocolate.",
              imageUrl: "https://cdn.example.com/funtan.jpg",
              buyUrl: "https://shop.example.com/products/funtan",
            },
          ],
        },
      ],
    });
    const keys = built.nodes.map((n) => n.node_key);
    expect(keys).toContain("img_sub_0_0");
    expect(keys).toContain("msg_sub_0_0");
    const img = built.nodes.find((n) => n.node_key === "img_sub_0_0");
    expect(img?.node_type).toBe("send_media");
    expect((img?.config as { media_url: string }).media_url).toContain(
      "funtan",
    );
    const msg = built.nodes.find((n) => n.node_key === "msg_sub_0_0");
    const text = (msg?.config as { text: string }).text;
    expect(text).toContain("Rich premium chocolate.");
    expect(text).toContain("Buy now:");
    expect(text).toContain("https://shop.example.com/products/funtan");
  });

  it("rejects non-https buy links", () => {
    const issues = validateSimpleMenuSpec({
      ...valid,
      options: [
        {
          title: "Deal",
          action: "message",
          messageText: "Hi",
          buyUrl: "http://insecure.example/buy",
        },
      ],
    });
    expect(issues.some((i) => i.field.includes("buyUrl"))).toBe(true);
  });
});
