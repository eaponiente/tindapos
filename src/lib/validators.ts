// Request validation shared by route handlers (route.ts files may only
// export HTTP methods, so helpers like these live here).

const ROLES = ['cashier', 'manager', 'owner'];
const REASONS = ['receive', 'recount', 'damage'];

export function validateEmployee(body: Record<string, unknown>): string | null {
  if (!String(body.name ?? '').trim()) return 'Name is required';
  if (!/^\d{4,6}$/.test(String(body.pin ?? ''))) return 'PIN must be 4 to 6 digits';
  if (!ROLES.includes(String(body.role))) return 'Invalid role';
  return null;
}

export function validateItem(body: Record<string, unknown>, { withStock = false } = {}): string | null {
  if (!String(body.name ?? '').trim()) return 'Name is required';
  if (!String(body.sku ?? '').trim()) return 'SKU is required';
  for (const f of ['cost', 'price', ...(withStock ? ['stock'] : []), 'low_stock']) {
    const v = Number(body[f]);
    if (Number.isNaN(v) || v < 0) return `${f.replace('_', ' ')} must be a number ≥ 0`;
  }
  return null;
}

export function validateAdjust(body: Record<string, unknown>): string | null {
  if (!REASONS.includes(String(body.reason))) return 'Invalid reason';
  if (!Number.isInteger(Number(body.qty))) return 'Enter a whole-number quantity';
  return null;
}
