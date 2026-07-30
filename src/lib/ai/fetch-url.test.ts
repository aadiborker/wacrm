import { describe, expect, it } from "vitest";
import {
  assertSafePublicUrl,
  htmlToPlainText,
  UrlImportError,
} from "./fetch-url";

describe("assertSafePublicUrl", () => {
  it("accepts public https URLs", () => {
    const u = assertSafePublicUrl("https://example.com/faq");
    expect(u.hostname).toBe("example.com");
  });

  it("rejects localhost and private IPs", () => {
    expect(() => assertSafePublicUrl("http://localhost/x")).toThrow(
      UrlImportError,
    );
    expect(() => assertSafePublicUrl("http://127.0.0.1/x")).toThrow(
      UrlImportError,
    );
    expect(() => assertSafePublicUrl("http://192.168.1.1/x")).toThrow(
      UrlImportError,
    );
    expect(() => assertSafePublicUrl("http://10.0.0.5/x")).toThrow(
      UrlImportError,
    );
  });

  it("rejects non-http schemes", () => {
    expect(() => assertSafePublicUrl("file:///etc/passwd")).toThrow(
      UrlImportError,
    );
  });
});

describe("htmlToPlainText", () => {
  it("strips scripts and prefers main content", () => {
    const html = `
      <html><head><title>T</title><script>evil()</script></head>
      <body>
        <nav>ignore</nav>
        <main><h1>Hello</h1><p>World &amp; friends</p></main>
      </body></html>`;
    const text = htmlToPlainText(html);
    expect(text).toContain("Hello");
    expect(text).toContain("World & friends");
    expect(text).not.toContain("evil");
  });
});
