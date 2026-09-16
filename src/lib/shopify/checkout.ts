/**
 * Helpers for Shopify Checkout webhook payloads (abandoned cart).
 */

export function extractCheckoutPhone(
  checkout: Record<string, unknown>,
): string | null {
  const customer =
    checkout.customer && typeof checkout.customer === 'object'
      ? (checkout.customer as Record<string, unknown>)
      : null;
  const billing =
    checkout.billing_address && typeof checkout.billing_address === 'object'
      ? (checkout.billing_address as Record<string, unknown>)
      : null;
  const shipping =
    checkout.shipping_address && typeof checkout.shipping_address === 'object'
      ? (checkout.shipping_address as Record<string, unknown>)
      : null;

  const candidates = [
    checkout.phone,
    customer?.phone,
    billing?.phone,
    shipping?.phone,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

export function extractCheckoutCustomerName(
  checkout: Record<string, unknown>,
): string | null {
  const customer =
    checkout.customer && typeof checkout.customer === 'object'
      ? (checkout.customer as Record<string, unknown>)
      : null;

  if (typeof customer?.first_name === 'string' && customer.first_name.trim()) {
    const last =
      typeof customer.last_name === 'string' ? customer.last_name.trim() : '';
    return [customer.first_name.trim(), last].filter(Boolean).join(' ');
  }

  const billing =
    checkout.billing_address && typeof checkout.billing_address === 'object'
      ? (checkout.billing_address as Record<string, unknown>)
      : null;
  if (typeof billing?.first_name === 'string' && billing.first_name.trim()) {
    const last =
      typeof billing.last_name === 'string' ? billing.last_name.trim() : '';
    return [billing.first_name.trim(), last].filter(Boolean).join(' ');
  }

  if (typeof checkout.email === 'string' && checkout.email.trim()) {
    return checkout.email.trim();
  }

  return null;
}

export function extractCheckoutUrl(
  checkout: Record<string, unknown>,
): string | null {
  if (
    typeof checkout.abandoned_checkout_url === 'string' &&
    checkout.abandoned_checkout_url.trim()
  ) {
    return checkout.abandoned_checkout_url.trim();
  }
  return null;
}

export function extractCheckoutEmail(
  checkout: Record<string, unknown>,
): string | null {
  if (typeof checkout.email === 'string' && checkout.email.trim()) {
    return checkout.email.trim().toLowerCase();
  }
  const customer =
    checkout.customer && typeof checkout.customer === 'object'
      ? (checkout.customer as Record<string, unknown>)
      : null;
  if (typeof customer?.email === 'string' && customer.email.trim()) {
    return customer.email.trim().toLowerCase();
  }
  return null;
}

export function isCheckoutCompleted(checkout: Record<string, unknown>): boolean {
  return checkout.completed_at != null && checkout.completed_at !== '';
}
