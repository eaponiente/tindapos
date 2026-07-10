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
  ({ cashier: 0, manager: 1, owner: 2 })[r as Role] ?? 0;
