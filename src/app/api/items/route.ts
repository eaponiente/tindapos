import { NextRequest, NextResponse } from 'next/server';
import { db, fail, friendlyDbError, handler, ITEM_SELECT, mapItem } from '@/lib/server';
import { validateItem } from '@/lib/validators';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request: NextRequest) => {
  const q = request.nextUrl.searchParams.get('q');

  let query = db().from('items').select(ITEM_SELECT).order('name');
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  return NextResponse.json((data ?? []).map(mapItem));
});

export const POST = handler(async (request: NextRequest) => {
  const body = await request.json();
  const invalid = validateItem(body, { withStock: true });
  if (invalid) return fail(invalid);

  const { data, error } = await db()
    .from('items')
    .insert({
      name: body.name,
      sku: body.sku,
      category_id: body.category_id || null,
      cost: Number(body.cost),
      price: Number(body.price),
      stock: Number(body.stock),
      low_stock: Number(body.low_stock),
      color: body.color || '#B88A2E',
    })
    .select(ITEM_SELECT)
    .single();
  if (error) return fail(friendlyDbError(error, 'SKU'));

  return NextResponse.json(mapItem(data), { status: 201 });
});
