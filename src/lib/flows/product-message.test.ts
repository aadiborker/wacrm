import { describe, expect, it } from "vitest";
import {
  composeProductMessage,
  isHttpsUrl,
  splitBuyUrlFromMessage,
} from "./product-message";

describe("product-message", () => {
  it("composes buy link trailer", () => {
    const body = composeProductMessage({
      messageText: "Funtan — rich chocolate.",
      buyUrl: "https://shop.example.com/funtan",
    });
    expect(body).toContain("Funtan — rich chocolate.");
    expect(body).toContain("Buy now:");
    expect(body).toContain("https://shop.example.com/funtan");
  });

  it("round-trips buy link via split", () => {
    const body = composeProductMessage({
      messageText: "Hello",
      buyUrl: "https://shop.example.com/x",
    });
    const split = splitBuyUrlFromMessage(body);
    expect(split.messageText).toBe("Hello");
    expect(split.buyUrl).toBe("https://shop.example.com/x");
  });

  it("isHttpsUrl rejects http", () => {
    expect(isHttpsUrl("https://ok.example")).toBe(true);
    expect(isHttpsUrl("http://no.example")).toBe(false);
  });
});
