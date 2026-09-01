import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const SALE_SELECT =
  '*, employee:employees(id, name), branch:branches(id, name), items:sale_items(*)';

/** PAY BILL — close the session by handing its items to the existing
 *  create_sale checkout, then free the tables. Returns the receipt (a Sale),
 *  the same shape the quick-sale flow produces, so the UI can print it. */
export const POST = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const body = await request.json();
  if (!body.employee_id) return fail('employee_id is required');
  if (!['cash', 'card'].includes(body.payment_method)) return fail('Invalid payment method');
  const discountPct = Number(body.discount_pct) || 0;
  if (discountPct < 0 || discountPct > 100) return fail('Discount must be between 0 and 100');

  const { data: saleId, error } = await db().rpc('close_table_session', {
    p_session_id: Number(id),
    p_payment_method: body.payment_method,
    p_tendered: Number(body.tendered) || 0,
    p_discount_pct: discountPct,
    p_employee_id: body.employee_id,
  });
  if (error) return fail(error.message);

  const { data: sale } = await db().from('sales').select(SALE_SELECT).eq('id', saleId).single();
  return NextResponse.json(sale, { status: 201 });
});
