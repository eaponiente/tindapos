// Client-side formatting helpers (ported from the old utils.js).
import type { Role } from './types';

export const peso = (n: number | string | null | undefined): string =>
  '₱' +
  (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const fmtDT = (ts: string | number | Date): string =>
  new Date(ts).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

// Cashier→Super Admin form the financial/management ladder. Waiter and Kitchen
// sit OUTSIDE this ladder (rank 0): they are gated by explicit screen access,
// not by rank — see allowedTab() in App.
export const roleRank = (r: Role | string): number =>
  ({ cashier: 0, manager: 1, owner: 2, super_admin: 3, waiter: 0, kitchen: 0 })[r as Role] ?? 0;

/** Human-friendly role name for display (the stored value is snake_case). */
export const roleLabel = (r: Role | string): string =>
  ({
    cashier: 'Cashier',
    manager: 'Manager',
    owner: 'Owner',
    super_admin: 'Super Admin',
    waiter: 'Waiter',
    kitchen: 'Kitchen',
  })[r as Role] ?? String(r);
