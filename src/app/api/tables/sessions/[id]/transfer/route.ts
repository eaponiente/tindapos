import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';
import { fetchSessionDetail } from '@/lib/tables';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** TRANSFER TABLE — move the whole session to a new set of tables. Rejected
 *  (and rolled back, keeping the original tables) if any target is occupied. */
export const POST = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const body = await request.json();
  const tableIds = Array.isArray(body.table_ids) ? body.table_ids.map(Number).filter(Boolean) : [];
  if (!body.employee_id) return fail('employee_id is required');
  if (tableIds.length === 0) return fail('Select at least one destination table');

  const { error } = await db().rpc('transfer_session', {
    p_session_id: Number(id),
    p_new_table_ids: tableIds,
    p_employee_id: body.employee_id,
  });
  if (error) return fail(error.message);

  return NextResponse.json(await fetchSessionDetail(Number(id)));
});
