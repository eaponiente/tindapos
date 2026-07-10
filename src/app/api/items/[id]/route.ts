import { NextRequest, NextResponse } from 'next/server';
import { db, fail, friendlyDbError, handler, IMAGE_BUCKET, ITEM_SELECT, mapItem } from '@/lib/server';
import { validateItem } from '@/lib/validators';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const body = await request.json();
  const invalid = validateItem(body);
  if (invalid) return fail(invalid);

  const { data, error } = await db()
    .from('items')
    .update({
      name: body.name,
      sku: body.sku,
      category_id: body.category_id || null,
      cost: Number(body.cost),
      price: Number(body.price),
      low_stock: Number(body.low_stock),
      ...(body.color ? { color: body.color } : {}),
      // stock is intentionally NOT editable here — use /adjust so every
      // change is captured in the stock_adjustments audit trail.
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(ITEM_SELECT)
    .single();
  if (error) return fail(friendlyDbError(error, 'SKU'));

  return NextResponse.json(mapItem(data));
});

export const DELETE = handler(async (_request: NextRequest, { params }: Ctx) => {
  const { id } = await params;

  const { data: item } = await db().from('items').select('image').eq('id', id).maybeSingle();
  if (item?.image) {
    await db().storage.from(IMAGE_BUCKET).remove([item.image]);
  }

  const { error } = await db().from('items').delete().eq('id', id);
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true });
});
