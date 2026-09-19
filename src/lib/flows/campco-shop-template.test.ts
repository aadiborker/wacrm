import { describe, expect, it } from "vitest";
import { CAMPCO_SHOP } from "./campco-shop-template";
import { getFlowTemplate } from "./templates";
import { validateFlowForActivation } from "./validate";

describe("CAMPCO shop template", () => {
  it("is registered and clones cleanly", () => {
    const t = getFlowTemplate("campco_shop");
    expect(t).not.toBeNull();
    expect(t!.slug).toBe("campco_shop");
    expect(t!.entry_node_id).toBe("start");
    expect(t!.nodes.length).toBeGreaterThan(10);
  });

  it("passes activation validation", () => {
    const issues = validateFlowForActivation(
      {
        name: CAMPCO_SHOP.name,
        trigger_type: CAMPCO_SHOP.trigger_type,
        trigger_config: CAMPCO_SHOP.trigger_config,
        entry_node_id: CAMPCO_SHOP.entry_node_id,
      },
      CAMPCO_SHOP.nodes.map((n) => ({
        node_key: n.node_key,
        node_type: n.node_type,
        config: n.config as Record<string, unknown>,
      })),
    );
    const errors = issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });
});
