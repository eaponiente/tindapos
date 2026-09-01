import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';
import { fetchSessionDetail } from '@/lib/tables';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Edit or remove one order line on an open table (fixing a mis-tap). A qty of
 *  0 or less removes the line; otherwise it sets the new quantity. */
export const PATCH = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const body = await request.json();
  if (!body.line_id) return fail('line_id is required');
  if (!body.employee_id) return fail('employee_id is required');

  const { error } = await db().rpc('update_session_item', {
    p_line_id: Number(body.line_id),
    p_qty: Number(body.qty) || 0,
    p_employee_id: body.employee_id,
  });
  if (error) return fail(error.message);

  return NextResponse.json(await fetchSessionDetail(Number(id)));
});
