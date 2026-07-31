import { describe, expect, it } from "vitest";
import {
  buildSimpleMenuFlow,
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
});
