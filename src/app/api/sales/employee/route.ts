import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';
import { staffPrice } from '@/lib/pricing';

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

  // Open (unpaid) employee credit tabs — currently owed, per employee. These
  // are open sessions (not yet sales); owed = the after-discount amount.
  let openTabs: { session_id: number; name: string; owed: number; item_count: number; opened_at: string }[] = [];
  let owedByEmployee: { name: string; owed: number }[] = [];
  let grandOwed = 0;
  {
    let sq = db()
      .from('table_sessions')
      .select('id, customer_name, opened_at')
      .eq('service_type', 'employee')
      .in('status', ['open', 'for_payment']);
    if (branchId) sq = sq.eq('branch_id', branchId);
    const { data: sessions } = await sq;
    const ids = (sessions ?? []).map((s) => s.id);
    const regBySession: Record<number, { total: number; count: number }> = {};
    if (ids.length) {
      const { data: sItems } = await db()
        .from('table_session_items')
        .select('session_id, price, qty')
        .in('session_id', ids);
      for (const it of sItems ?? []) {
        const g = (regBySession[it.session_id] ??= { total: 0, count: 0 });
        g.total += Number(it.price) * it.qty;
        g.count += it.qty;
      }
    }
    openTabs = (sessions ?? []).map((s) => ({
      session_id: s.id,
      name: s.customer_name || 'Employee',
      owed: staffPrice(regBySession[s.id]?.total ?? 0),
      item_count: regBySession[s.id]?.count ?? 0,
      opened_at: s.opened_at,
    }));
    const owedMap = new Map<string, number>();
    for (const t of openTabs) owedMap.set(t.name, (owedMap.get(t.name) ?? 0) + t.owed);
    owedByEmployee = [...owedMap.entries()].map(([name, owed]) => ({ name, owed }));
    grandOwed = openTabs.reduce((a, t) => a + t.owed, 0);
  }

  return NextResponse.json({ rows, byEmployee, grandTotal, grandCount, openTabs, owedByEmployee, grandOwed });
});
