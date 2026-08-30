import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

type Ctx = { params: Promise<{ id: string }> };

const SALE_SELECT = '*, employee:employees(id, name), branch:branches(id, name), items:sale_items(*)';

export const GET = handler(async (_request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { data, error } = await db()
    .from('sales')
    .select(SALE_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('Sale not found', 404);
  return NextResponse.json(data);
});

/** Correct the mode of payment on a past sale (owner fixing a cashier's
 *  mis-tap). Only the payment method is editable — never the amounts. When
 *  switching to GCash there is no change to give, so tendered = total. */
export const PATCH = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const body = await request.json();
  const method = body.payment_method;
  if (!['cash', 'card'].includes(method)) return fail('Invalid payment method');

  const { data: sale, error: findErr } = await db()
    .from('sales')
    .select('total, refunded')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return fail(findErr.message, 500);
  if (!sale) return fail('Sale not found', 404);
  if (sale.refunded) return fail('This sale was refunded — its payment method can no longer be changed');

  const patch =
    method === 'card'
      ? { payment_method: method, tendered: sale.total, change_due: 0 }
      : { payment_method: method };

  const { error } = await db().from('sales').update(patch).eq('id', id);
  if (error) return fail(error.message);

  const { data } = await db().from('sales').select(SALE_SELECT).eq('id', id).single();
  return NextResponse.json(data);
});
