import { NextRequest, NextResponse } from 'next/server';
import { db, fail, friendlyDbError, handler, ITEM_SELECT, mapItem } from '@/lib/server';
import { validateItem } from '@/lib/validators';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request: NextRequest) => {
  const q = request.nextUrl.searchParams.get('q');
  const branchId = request.nextUrl.searchParams.get('branch_id');

  let query = db().from('items').select(ITEM_SELECT).order('name');
  if (branchId) query = query.eq('branch_id', branchId);
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  // Sort by the owner's arranged order in JS (falls back to name when the
  // position column isn't migrated yet, so items always load).
  const items = (data ?? []).map(mapItem);
  items.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  return NextResponse.json(items);
});

export const POST = handler(async (request: NextRequest) => {
  const body = await request.json();
  const invalid = validateItem(body, { withStock: true });
  if (invalid) return fail(invalid);
  if (!body.branch_id) return fail('A branch is required');

  const row: Record<string, unknown> = {
    name: body.name,
    sku: body.sku,
    branch_id: body.branch_id,
    category_id: body.category_id || null,
    cost: Number(body.cost),
    price: Number(body.price),
    employee_price:
      body.employee_price === '' || body.employee_price == null ? null : Number(body.employee_price),
    stock: Number(body.stock),
    low_stock: Number(body.low_stock),
    color: body.color || '#B88A2E',
  };
  const insert = () => db().from('items').insert(row).select(ITEM_SELECT).single();
  let res = await insert();
  // Graceful fallback if employee_price isn't migrated yet.
  if (res.error && /employee_price/i.test(res.error.message)) {
    delete row.employee_price;
    res = await insert();
  }
  if (res.error) return fail(friendlyDbError(res.error, 'SKU'));

  return NextResponse.json(mapItem(res.data), { status: 201 });
});
