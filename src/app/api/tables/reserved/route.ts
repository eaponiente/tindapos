import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Quantities of each item currently committed to OPEN table sessions at a
 *  branch. Used by the table-ordering screen to show honest "X left" numbers
 *  (real stock minus what's already sitting on other open tables). */
export const GET = handler(async (request: NextRequest) => {
  const branchId = request.nextUrl.searchParams.get('branch_id');
  if (!branchId) return fail('A branch is required');

  const { data, error } = await db()
    .from('table_session_items')
    .select('item_id, qty, session:table_sessions!inner(status, branch_id)')
    .eq('session.branch_id', branchId)
    .in('session.status', ['open', 'for_payment']);
  if (error) return fail(error.message, 500);

  const reserved: Record<number, number> = {};
  for (const row of data ?? []) {
    if (row.item_id == null) continue;
    reserved[row.item_id] = (reserved[row.item_id] ?? 0) + row.qty;
  }
  return NextResponse.json(reserved);
});
