import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

const PER_PAGE = 50;
const SALE_SELECT = '*, employee:employees(id, name), items:sale_items(*)';

/** Unlimited sales history — paginated so the API stays fast no matter how many years of receipts pile up. */
export const GET = handler(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams;
  const q = sp.get('q')?.trim();
  const employeeId = sp.get('employee_id');
  const page = Math.max(1, Number(sp.get('page')) || 1);

  let query = db()
    .from('sales')
    .select(SALE_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);

  if (employeeId) query = query.eq('employee_id', employeeId);

  if (q) {
    // Match by receipt # and/or by sold item name (the old orWhereHas).
    const ids = new Set<number>();
    if (/^\d+$/.test(q)) ids.add(Number(q));
    const { data: lines } = await db()
      .from('sale_items')
      .select('sale_id')
      .ilike('name', `%${q}%`)
      .limit(2000);
    for (const l of lines ?? []) ids.add(l.sale_id);
    if (ids.size === 0) {
      return NextResponse.json({ data: [], page, per_page: PER_PAGE, total: 0, has_next: false });
    }
    query = query.in('id', [...ids]);
  }

  const { data, count, error } = await query;
  if (error) return fail(error.message, 500);

  const total = count ?? 0;
  return NextResponse.json({
    data: data ?? [],
    page,
    per_page: PER_PAGE,
    total,
    has_next: page * PER_PAGE < total,
  });
});

/** Checkout — delegates to the create_sale Postgres function so stock
 *  validation, decrement, and the receipt rows commit atomically. */
export const POST = handler(async (request: NextRequest) => {
  const body = await request.json();

  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!body.employee_id) return fail('employee_id is required');
  if (lines.length === 0) return fail('The ticket is empty');
  if (!['cash', 'card'].includes(body.payment_method)) return fail('Invalid payment method');
  const discountPct = Number(body.discount_pct) || 0;
  if (discountPct < 0 || discountPct > 100) return fail('Discount must be between 0 and 100');

  const { data: saleId, error } = await db().rpc('create_sale', {
    p_employee_id: body.employee_id,
    p_discount_pct: discountPct,
    p_payment_method: body.payment_method,
    p_tendered: Number(body.tendered) || 0,
    p_lines: lines.map((l: { item_id: number; qty: number }) => ({
      item_id: l.item_id,
      qty: l.qty,
    })),
  });
  if (error) return fail(error.message);

  const { data: sale } = await db().from('sales').select(SALE_SELECT).eq('id', saleId).single();
  return NextResponse.json(sale, { status: 201 });
});
