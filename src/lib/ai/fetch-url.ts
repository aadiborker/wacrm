/**
 * Fetch a public https:// page and extract readable plain text for
 * the AI knowledge base. Used by POST /api/ai/knowledge/from-url.
 *
 * Deliberately simple (no headless browser): works for static /
 * server-rendered marketing sites and FAQs. JS-only SPAs will often
 * yield thin content — admins can still paste text manually.
 *
 * SSRF guards: http(s) only, block localhost / private / link-local
 * hosts and literal private IPs, short timeout, size cap.
 */

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_500_000; // ~1.5 MB raw HTML
const MAX_TEXT_CHARS = 80_000;

export class UrlImportError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "UrlImportError";
  }
}

export interface ImportedPage {
  url: string;
  title: string;
  content: string;
}

export async function importPageFromUrl(rawUrl: string): Promise<ImportedPage> {
  const url = assertSafePublicUrl(rawUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "ReplyFlowKnowledgeBot/1.0 (+https://replyflow.thewebpeople.co)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new UrlImportError("Timed out fetching that URL.", 504);
    }
    throw new UrlImportError(
      "Could not reach that URL. Check the link and try again.",
      502,
    );
  } finally {
    clearTimeout(timer);
  }

  // Re-check final URL after redirects (SSRF via open redirect).
  try {
    assertSafePublicUrl(res.url || url.toString());
  } catch {
    throw new UrlImportError(
      "That URL redirected to a blocked address.",
      400,
    );
  }

  if (!res.ok) {
    throw new UrlImportError(
      `Website returned HTTP ${res.status}.`,
      502,
    );
  }

  const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
  if (
    ctype &&
    !ctype.includes("text/html") &&
    !ctype.includes("application/xhtml") &&
    !ctype.includes("text/plain")
  ) {
    throw new UrlImportError(
      "URL must point to an HTML page (not a PDF/image/API).",
      400,
    );
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    throw new UrlImportError("Page is too large to import.", 413);
  }

  const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (ctype.includes("text/plain")) {
    const content = html.trim().slice(0, MAX_TEXT_CHARS);
    if (content.length < 40) {
      throw new UrlImportError("Page had almost no text to import.", 422);
    }
    return {
      url: res.url || url.toString(),
      title: deriveTitleFromUrl(url),
      content,
    };
  }

  const title = extractTitle(html) || deriveTitleFromUrl(url);
  const content = htmlToPlainText(html).slice(0, MAX_TEXT_CHARS).trim();
  if (content.length < 40) {
    throw new UrlImportError(
      "Could not extract enough text (site may be JavaScript-only). Paste the content manually instead.",
      422,
    );
  }

  return { url: res.url || url.toString(), title, content };
}

export function assertSafePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UrlImportError("Enter a valid URL (https://…).");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlImportError("Only http:// and https:// URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new UrlImportError("URLs with credentials are not allowed.");
  }

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    throw new UrlImportError("That host is not allowed.");
  }

  if (isBlockedIpLiteral(host)) {
    throw new UrlImportError("Private or local IP addresses are not allowed.");
  }

  return url;
}

function isBlockedIpLiteral(host: string): boolean {
  // IPv4
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const parts = m.slice(1).map(Number);
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  // IPv6 literals — block loopback / ULA / link-local roughly
  if (host.includes(":")) {
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd")) {
      return true;
    }
    if (host.startsWith("fe80")) return true;
  }
  return false;
}

function extractTitle(html: string): string {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(
    html,
  );
  if (og?.[1]) return decodeEntities(og[1]).trim();
  const t = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return t?.[1] ? decodeEntities(t[1]).trim() : "";
}

function deriveTitleFromUrl(url: URL): string {
  const path = url.pathname.replace(/\/+$/, "");
  const last = path.split("/").filter(Boolean).pop();
  if (last) {
    return decodeURIComponent(last)
      .replace(/[-_]+/g, " ")
      .replace(/\.[a-z0-9]+$/i, "")
      .trim()
      .slice(0, 120);
  }
  return url.hostname;
}

/**
 * Naive HTML → text: drop scripts/styles, prefer <main>/<article>,
 * then strip tags and collapse whitespace.
 */
export function htmlToPlainText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const main =
    /<main[\s\S]*?<\/main>/i.exec(s)?.[0] ??
    /<article[\s\S]*?<\/article>/i.exec(s)?.[0] ??
    null;
  if (main) s = main;

  s = s
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ");

  s = decodeEntities(s);
  return s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    });
}
