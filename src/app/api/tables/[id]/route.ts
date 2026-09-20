import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

type Ctx = { params: Promise<{ id: string }> };

/** Remove a physical table from the floor. Refused while the table is in use
 *  by an active session so a live tab is never orphaned. Historical (released)
 *  assignments cascade away; sales keep their own text snapshot of the table. */
export const DELETE = handler(async (_request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const tableId = Number(id);
  if (!tableId) return fail('A table is required');

  const { data: active, error: activeErr } = await db()
    .from('table_session_tables')
    .select('id')
    .eq('table_id', tableId)
    .is('released_at', null)
    .limit(1);
  if (activeErr) return fail(activeErr.message);
  if (active && active.length) {
    return fail('This table is occupied. Free it (pay or void the session) before removing it.', 409);
  }

  const { error } = await db().from('restaurant_tables').delete().eq('id', tableId);
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true });
});
