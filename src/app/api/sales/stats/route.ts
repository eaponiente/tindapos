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

  // Split non-refunded sales by payment method for separate Cash / GCash tallies.
  let paidQuery = db().from('sales').select('payment_method, total').eq('refunded', false);
  if (branchNum) paidQuery = paidQuery.eq('branch_id', branchNum);
  const { data: paid } = await paidQuery;
  let cash_total = 0;
  let cash_count = 0;
  let gcash_total = 0;
  let gcash_count = 0;
  for (const s of paid ?? []) {
    if (s.payment_method === 'cash') {
      cash_total += Number(s.total);
      cash_count += 1;
    } else {
      gcash_total += Number(s.total);
      gcash_count += 1;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    ...data,
    refunded_count: count ?? 0,
    refunded_total: round(refunded_total),
    cash_total: round(cash_total),
    cash_count,
    gcash_total: round(gcash_total),
    gcash_count,
  });
});
