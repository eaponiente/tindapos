import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';
import { fetchSessionDetail } from '@/lib/tables';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** ADD ORDER — append a round of items to the session's running order. */
export const POST = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const body = await request.json();
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!body.employee_id) return fail('employee_id is required');
  if (lines.length === 0) return fail('The order is empty');

  const { error } = await db().rpc('add_session_round', {
    p_session_id: Number(id),
    p_lines: lines.map((l: { item_id: number; qty: number }) => ({ item_id: l.item_id, qty: l.qty })),
    p_employee_id: body.employee_id,
  });
  if (error) return fail(error.message);

  // A new round means new food to cook — put the table back on the Kitchen board
  // if it had been marked complete. (No-op before migration 00024.)
  await db().from('table_sessions').update({ kitchen_done_at: null }).eq('id', Number(id));

  return NextResponse.json(await fetchSessionDetail(Number(id)));
});
