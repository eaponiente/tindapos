import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';
import type { OrderTicket } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** List the open take-out / delivery / pick-up tickets for a branch, each with
 *  its running total and item count. */
export const GET = handler(async (request: NextRequest) => {
  const branchId = request.nextUrl.searchParams.get('branch_id');
  if (!branchId) return fail('A branch is required');

  const { data: sessions, error } = await db()
    .from('table_sessions')
    .select(
      'id, service_type, status, customer_count, customer_name, customer_phone, customer_address, customer_landmark, opened_at',
    )
    .eq('branch_id', branchId)
    .neq('service_type', 'dine_in')
    .in('status', ['open', 'for_payment'])
    .order('opened_at', { ascending: true });
  if (error) return fail(error.message, 500);

  const ids = (sessions ?? []).map((s) => s.id);
  const totals: Record<number, { total: number; count: number }> = {};
  if (ids.length) {
    const { data: items } = await db()
      .from('table_session_items')
      .select('session_id, price, qty')
      .in('session_id', ids);
    for (const it of items ?? []) {
      const t = (totals[it.session_id] ??= { total: 0, count: 0 });
      t.total += Number(it.price) * it.qty;
      t.count += it.qty;
    }
  }

  const tickets: OrderTicket[] = (sessions ?? []).map((s) => ({
    ...s,
    total: totals[s.id]?.total ?? 0,
    item_count: totals[s.id]?.count ?? 0,
  })) as OrderTicket[];
  return NextResponse.json(tickets);
});

/** Open a new take-out / delivery / pick-up ticket. */
export const POST = handler(async (request: NextRequest) => {
  const body = await request.json();
  if (!body.branch_id) return fail('A branch is required');
  if (!body.employee_id) return fail('employee_id is required');
  if (!['take_out', 'delivery', 'pick_up'].includes(body.service_type)) {
    return fail('Choose take-out, delivery, or pick-up');
  }

  const { data: sessionId, error } = await db().rpc('open_order_session', {
    p_branch_id: body.branch_id,
    p_service_type: body.service_type,
    p_customer_count: Number(body.customer_count) || 1,
    p_name: body.customer_name ?? null,
    p_phone: body.customer_phone ?? null,
    p_address: body.customer_address ?? null,
    p_landmark: body.customer_landmark ?? null,
    p_employee_id: body.employee_id,
  });
  if (error) return fail(error.message);

  return NextResponse.json({ session_id: sessionId }, { status: 201 });
});
