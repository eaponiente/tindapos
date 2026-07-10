import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

type Ctx = { params: Promise<{ id: string }> };

/** Refund — the refund_sale Postgres function flags the sale and returns
 *  every line's quantity back to stock in one transaction. */
export const POST = handler(async (_request: NextRequest, { params }: Ctx) => {
  const { id } = await params;

  const { error } = await db().rpc('refund_sale', { p_sale_id: Number(id) });
  if (error) return fail(error.message);

  const { data } = await db()
    .from('sales')
    .select('*, employee:employees(id, name), items:sale_items(*)')
    .eq('id', id)
    .single();
  return NextResponse.json(data);
});
