import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Set one order item's kitchen status (toggle done, etc.). Persisted so the
 *  state survives refreshes and is shared across every open Kitchen screen. */
export const POST = handler(async (request: NextRequest) => {
  const { item_id, status } = await request.json();
  if (!item_id) return fail('item_id is required');
  if (!['pending', 'preparing', 'done'].includes(status)) return fail('Invalid status');

  const { error } = await db()
    .from('table_session_items')
    .update({
      kitchen_status: status,
      kitchen_done_at: status === 'done' ? new Date().toISOString() : null,
    })
    .eq('id', item_id);
  if (error) return fail(error.message);

  return NextResponse.json({ ok: true });
});
