import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Stats for the Inventory screen header. */
export const GET = handler(async (request: NextRequest) => {
  const branchId = request.nextUrl.searchParams.get('branch_id');
  let query = db().from('items').select('cost, stock, low_stock');
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  const items = data ?? [];
  return NextResponse.json({
    count: items.length,
    low: items.filter((i) => i.stock > 0 && i.stock <= i.low_stock).length,
    out: items.filter((i) => i.stock <= 0).length,
    stock_value:
      Math.round(items.reduce((s, i) => s + Number(i.cost) * Math.max(0, i.stock), 0) * 100) / 100,
  });
});
