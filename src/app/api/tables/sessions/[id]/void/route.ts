import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Cancel an open session without payment (guests left / mistake). No stock
 *  was taken, so this simply frees the tables and marks the session void. */
export const POST = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const body = await request.json();
  if (!body.employee_id) return fail('employee_id is required');

  const { error } = await db().rpc('void_table_session', {
    p_session_id: Number(id),
    p_employee_id: body.employee_id,
  });
  if (error) return fail(error.message);

  return NextResponse.json({ ok: true });
});
