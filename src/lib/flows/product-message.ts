/**
 * Shared helpers for product-style WhatsApp replies: optional image +
 * text + HTTPS “Buy now” link. Used by Simple Menu compilation and by
 * Advanced Flow `send_message` (image_url / buy_url on the node config).
 *
 * Buy links are plain HTTPS URLs in the text bubble — WhatsApp session
 * messages do not support tappable CTA URL buttons outside templates.
 */

import { INTERACTIVE_LIMITS } from "@/lib/whatsapp/meta-api";

const BODY_MAX = INTERACTIVE_LIMITS.bodyMaxLength;

export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function trim(s: string | undefined): string {
  return (s ?? "").trim();
}

/** Compose customer-facing body: message (+ optional title fallback) + Buy now trailer. */
export function composeProductMessage(item: {
  messageText?: string;
  buyUrl?: string;
  /** Used only when messageText is empty (Simple Menu leaf title). */
  titleFallback?: string;
}): string {
  const parts: string[] = [];
  const msg = trim(item.messageText);
  if (msg) parts.push(msg);
  else if (trim(item.titleFallback)) parts.push(trim(item.titleFallback));

  const buyUrl = trim(item.buyUrl);
  if (buyUrl) {
    parts.push(`Buy now:\n${buyUrl}`);
  }
  return parts.join("\n\n").slice(0, BODY_MAX);
}

/** Split a composed body back into message + buyUrl for editors. */
export function splitBuyUrlFromMessage(text: string): {
  messageText: string;
  buyUrl?: string;
} {
  const marker = /\n\nBuy now:\n(https:\/\/\S+)\s*$/i;
  const match = text.match(marker);
  if (!match) return { messageText: text };
  return {
    messageText: text.slice(0, match.index).trim(),
    buyUrl: match[1],
  };
}
