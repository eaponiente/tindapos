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

export const roleRank = (r: Role | string): number =>
  ({ cashier: 0, manager: 1, owner: 2, super_admin: 3 })[r as Role] ?? 0;

/** Human-friendly role name for display (the stored value is snake_case). */
export const roleLabel = (r: Role | string): string =>
  ({ cashier: 'Cashier', manager: 'Manager', owner: 'Owner', super_admin: 'Super Admin' })[r as Role] ??
  String(r);
