import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Sales-vs-expenses net income for a date range (inclusive). */
export const GET = handler(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams;
  const branchId = sp.get('branch_id');
  const from = sp.get('from');
  const to = sp.get('to');
  if (!from || !to) return fail('A date range is required');

  const { data, error } = await db().rpc('net_income', {
    p_branch_id: branchId ? Number(branchId) : null,
    p_from: from,
    p_to: to,
  });
  if (error) return fail(error.message);
  return NextResponse.json(data);
});
