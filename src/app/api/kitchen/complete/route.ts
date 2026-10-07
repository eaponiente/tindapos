import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** TABLE COMPLETED — mark a whole session's food done and flag it for payment.
 *  The table stays occupied until the Cashier's Pay Bill; nothing is freed or
 *  charged here. */
export const POST = handler(async (request: NextRequest) => {
  const { session_id, employee_id } = await request.json();
  if (!session_id) return fail('session_id is required');

  const { error } = await db().rpc('kitchen_complete_session', {
    p_session_id: Number(session_id),
    p_employee_id: employee_id ?? null,
  });
  if (error) return fail(error.message);

  return NextResponse.json({ ok: true });
});
