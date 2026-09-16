/**
 * Normalize a shop input to `{store}.myshopify.com`.
 * Accepts: "store", "store.myshopify.com", "https://store.myshopify.com/admin"
 */
export function normalizeShopDomain(input: string): string | null {
  let raw = input.trim().toLowerCase();
  if (!raw) return null;

  raw = raw.replace(/^https?:\/\//, '');
  raw = raw.split('/')[0] ?? '';
  raw = raw.split('?')[0] ?? '';
  if (!raw) return null;

  if (!raw.includes('.')) {
    raw = `${raw}.myshopify.com`;
  }

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(raw)) {
    return null;
  }

  return raw;
}
