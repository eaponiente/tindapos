import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Summary stats for the History screen header (sales_stats Postgres fn), plus
 *  a refunds quick-view (count + total) computed alongside without a migration. */
export const GET = handler(async (request: NextRequest) => {
  const branchId = request.nextUrl.searchParams.get('branch_id');
  const branchNum = branchId ? Number(branchId) : null;

  const { data, error } = await db().rpc('sales_stats', { p_branch_id: branchNum });
  if (error) return fail(error.message, 500);

  let refundQuery = db().from('sales').select('total', { count: 'exact' }).eq('refunded', true);
  if (branchNum) refundQuery = refundQuery.eq('branch_id', branchNum);
  const { data: refunds, count } = await refundQuery;
  const refunded_total = (refunds ?? []).reduce((s, r) => s + Number(r.total), 0);

  return NextResponse.json({
    ...data,
    refunded_count: count ?? 0,
    refunded_total: Math.round(refunded_total * 100) / 100,
  });
});
