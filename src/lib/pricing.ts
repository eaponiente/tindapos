// Shared employee-pricing constants/helpers used by both the client (Service,
// History) and the server (employee-sales report), so the discount is defined
// in exactly one place.

/** Flat automatic discount applied to every 👤 Employee purchase (a per-item
 *  Employee price, when set, overrides this for that item). */
export const EMPLOYEE_DISCOUNT_PCT = 25;

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** What staff pay for a regular amount after the flat employee discount. */
export const staffPrice = (regular: number): number =>
  round2(regular * (1 - EMPLOYEE_DISCOUNT_PCT / 100));
