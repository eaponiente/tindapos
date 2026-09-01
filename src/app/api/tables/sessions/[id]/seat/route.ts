import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';
import { fetchSessionDetail } from '@/lib/tables';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Convert a take-out / pick-up order into a dine-in table order: assign it to
 *  one or more free tables, keeping the order intact. */
export const POST = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const body = await request.json();
  const tableIds = Array.isArray(body.table_ids) ? body.table_ids.map(Number).filter(Boolean) : [];
  if (!body.employee_id) return fail('employee_id is required');
  if (tableIds.length === 0) return fail('Select at least one table');

  const { error } = await db().rpc('seat_order_at_table', {
    p_session_id: Number(id),
    p_table_ids: tableIds,
    p_employee_id: body.employee_id,
  });
  if (error) return fail(error.message);

  return NextResponse.json(await fetchSessionDetail(Number(id)));
});
