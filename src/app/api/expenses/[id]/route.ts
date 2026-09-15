import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Edit an expense (owner correcting an entry). */
export const PATCH = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const body = await request.json();
  const patch: Record<string, unknown> = {};
  if (body.category != null) patch.category = String(body.category);
  if (body.amount != null) {
    const a = Number(body.amount);
    if (!(a > 0)) return fail('Enter an amount greater than zero');
    patch.amount = a;
  }
  if (body.note !== undefined) patch.note = body.note?.trim() || null;
  if (body.spent_at) patch.spent_at = body.spent_at;
  if (body.payment_method) patch.payment_method = body.payment_method === 'gcash' ? 'gcash' : 'cash';
  if (Object.keys(patch).length === 0) return fail('Nothing to update');

  let { data, error } = await db().from('expenses').update(patch).eq('id', Number(id)).select('*').single();
  // Graceful fallback if payment_method isn't migrated yet.
  if (error && /payment_method/i.test(error.message)) {
    const { payment_method, ...rest } = patch;
    void payment_method;
    ({ data, error } = await db().from('expenses').update(rest).eq('id', Number(id)).select('*').single());
  }
  if (error) return fail(error.message);
  return NextResponse.json(data);
});

/** Delete an expense (owner correcting a mistake). */
export const DELETE = handler(async (_request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { error } = await db().from('expenses').delete().eq('id', Number(id));
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true });
});
