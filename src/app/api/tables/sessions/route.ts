import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Start a new table session (Start New Order): claims one or more free tables
 *  for a new open tab. The DB rejects any table that's already occupied. */
export const POST = handler(async (request: NextRequest) => {
  const body = await request.json();
  const tableIds = Array.isArray(body.table_ids) ? body.table_ids.map(Number).filter(Boolean) : [];
  if (!body.branch_id) return fail('A branch is required');
  if (!body.employee_id) return fail('employee_id is required');
  if (tableIds.length === 0) return fail('Select at least one table');

  const { data: sessionId, error } = await db().rpc('open_table_session', {
    p_branch_id: body.branch_id,
    p_table_ids: tableIds,
    p_customer_count: Number(body.customer_count) || 1,
    p_employee_id: body.employee_id,
  });
  if (error) return fail(error.message);

  // Reservation extras (name + arrival time) — held on the same dine-in session.
  const name = body.customer_name?.trim();
  const reservedAt = body.reserved_at || null;
  if (name || reservedAt) {
    await db()
      .from('table_sessions')
      .update({ customer_name: name || null, reserved_at: reservedAt })
      .eq('id', sessionId);
  }

  return NextResponse.json({ session_id: sessionId }, { status: 201 });
});
