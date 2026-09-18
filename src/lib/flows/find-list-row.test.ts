import { describe, expect, it } from "vitest";
import { findListRow, matchReplyId } from "./engine";

describe("findListRow", () => {
  const listNode = {
    node_type: "send_list",
    config: {
      text: "Pick a chocolate",
      button_label: "View",
      sections: [
        {
          title: "Premium",
          rows: [
            {
              reply_id: "funtan",
              title: "Funtan",
              image_url: "https://cdn.example.com/funtan.jpg",
              product_text: "Rich premium chocolate.",
              buy_url: "https://shop.example.com/funtan",
              next_node_key: "handoff",
            },
            {
              reply_id: "dark",
              title: "Dark 70%",
              next_node_key: "end",
            },
          ],
        },
      ],
    },
  };

  it("returns the matching product row", () => {
    const row = findListRow(listNode, "funtan");
    expect(row?.title).toBe("Funtan");
    expect(row?.buy_url).toContain("funtan");
    expect(row?.image_url).toContain("funtan.jpg");
  });

  it("matchReplyId still returns next_node_key", () => {
    expect(matchReplyId(listNode, "funtan")).toBe("handoff");
    expect(matchReplyId(listNode, "missing")).toBeNull();
  });
});
