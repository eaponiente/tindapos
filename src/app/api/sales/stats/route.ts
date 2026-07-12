import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Summary stats for the History screen header (sales_stats Postgres fn). */
export const GET = handler(async (request: NextRequest) => {
  const branchId = request.nextUrl.searchParams.get('branch_id');
  const { data, error } = await db().rpc('sales_stats', {
    p_branch_id: branchId ? Number(branchId) : null,
  });
  if (error) return fail(error.message, 500);
  return NextResponse.json(data);
});
