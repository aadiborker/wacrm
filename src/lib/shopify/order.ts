/**
 * Pull a usable phone from a Shopify order payload.
 * Prefers customer.phone, then billing/shipping/order phone.
 */
export function extractOrderPhone(order: Record<string, unknown>): string | null {
  const customer =
    order.customer && typeof order.customer === 'object'
      ? (order.customer as Record<string, unknown>)
      : null;
  const billing =
    order.billing_address && typeof order.billing_address === 'object'
      ? (order.billing_address as Record<string, unknown>)
      : null;
  const shipping =
    order.shipping_address && typeof order.shipping_address === 'object'
      ? (order.shipping_address as Record<string, unknown>)
      : null;

  const candidates = [
    customer?.phone,
    billing?.phone,
    shipping?.phone,
    order.phone,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

export function extractOrderCustomerName(
  order: Record<string, unknown>,
): string | null {
  const customer =
    order.customer && typeof order.customer === 'object'
      ? (order.customer as Record<string, unknown>)
      : null;

  if (typeof customer?.first_name === 'string' && customer.first_name.trim()) {
    const last =
      typeof customer.last_name === 'string' ? customer.last_name.trim() : '';
    return [customer.first_name.trim(), last].filter(Boolean).join(' ');
  }

  if (typeof order.email === 'string' && order.email.trim()) {
    return order.email.trim();
  }

  return null;
}

export function extractOrderNumber(order: Record<string, unknown>): string {
  if (typeof order.name === 'string' && order.name.trim()) {
    return order.name.trim();
  }
  if (order.order_number != null) {
    return `#${String(order.order_number)}`;
  }
  if (order.id != null) {
    return String(order.id);
  }
  return 'order';
}
