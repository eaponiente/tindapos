import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Employee-purchase sales for a date range (inclusive), with a per-employee
 *  summary. Employee purchases are sales tagged order_type='employee'; the buyer
 *  is stored in customer_name. Owner-facing tracking of staff purchases. */
export const GET = handler(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams;
  const branchId = sp.get('branch_id');
  const from = sp.get('from');
  const to = sp.get('to');
  if (!from || !to) return fail('A date range is required');
  const nextDay = new Date(new Date(`${to}T00:00:00`).getTime() + 86400000).toISOString().slice(0, 10);

  let query = db()
    .from('sales')
    .select('id, created_at, customer_name, employee_name, subtotal, discount, total, payment_method, refunded')
    .eq('order_type', 'employee')
    .gte('created_at', from)
    .lt('created_at', nextDay)
    .order('created_at', { ascending: false });
  if (branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  const rows = data ?? [];

  // Per-employee totals (buyer = customer_name), excluding refunded.
  const map = new Map<string, { name: string; count: number; total: number }>();
  for (const s of rows) {
    if (s.refunded) continue;
    const name = s.customer_name || 'Employee';
    const g = map.get(name) ?? { name, count: 0, total: 0 };
    g.count += 1;
    g.total += Number(s.total);
    map.set(name, g);
  }
  const byEmployee = [...map.values()].sort((a, b) => b.total - a.total);
  const grandTotal = byEmployee.reduce((a, e) => a + e.total, 0);
  const grandCount = byEmployee.reduce((a, e) => a + e.count, 0);

  return NextResponse.json({ rows, byEmployee, grandTotal, grandCount });
});
