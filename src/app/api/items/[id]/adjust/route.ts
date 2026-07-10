import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler, ITEM_SELECT, mapItem } from '@/lib/server';
import { validateAdjust } from '@/lib/validators';

type Ctx = { params: Promise<{ id: string }> };

/** Advanced inventory: receive delivery / physical recount / damage-waste, fully audited. */
export const POST = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const body = await request.json();
  const invalid = validateAdjust(body);
  if (invalid) return fail(invalid);

  const { data: item } = await db().from('items').select('id, stock').eq('id', id).maybeSingle();
  if (!item) return fail('Item not found', 404);

  const qty = Number(body.qty);
  const before = item.stock;
  const after =
    body.reason === 'receive'
      ? before + Math.abs(qty)
      : body.reason === 'damage'
        ? Math.max(0, before - Math.abs(qty))
        : Math.max(0, qty); // recount: set exact

  const { error } = await db()
    .from('items')
    .update({ stock: after, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return fail(error.message);

  await db().from('stock_adjustments').insert({
    item_id: item.id,
    employee_id: body.employee_id ?? null,
    reason: body.reason,
    before_qty: before,
    after_qty: after,
  });

  const { data } = await db().from('items').select(ITEM_SELECT).eq('id', id).single();
  return NextResponse.json(mapItem(data));
});
