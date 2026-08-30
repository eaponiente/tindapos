import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Save a new Sell-grid order. Body: { ids: number[] } — item ids in the
 *  desired order. The reorder_items RPC rewrites their positions atomically. */
export const PUT = handler(async (request: NextRequest) => {
  const body = await request.json();
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
  if (ids.length === 0) return fail('No items to reorder');

  const { error } = await db().rpc('reorder_items', { p_ids: ids });
  if (error) return fail(error.message);

  return NextResponse.json({ ok: true });
});
