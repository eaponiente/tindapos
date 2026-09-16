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
  if (body.fund_source) patch.fund_source = body.fund_source === 'employee' ? 'employee' : 'sales';
  if (Object.keys(patch).length === 0) return fail('Nothing to update');

  const upd = (row: Record<string, unknown>) =>
    db().from('expenses').update(row).eq('id', Number(id)).select('*').single();
  let current = patch;
  let res = await upd(current);
  // Graceful fallbacks if a column isn't migrated yet.
  if (res.error && /fund_source/i.test(res.error.message)) {
    const { fund_source, ...rest } = current;
    void fund_source;
    current = rest;
    res = await upd(current);
  }
  if (res.error && /payment_method/i.test(res.error.message)) {
    const { payment_method, ...rest } = current;
    void payment_method;
    current = rest;
    res = await upd(current);
  }
  if (res.error) return fail(res.error.message);
  return NextResponse.json(res.data);
});

/** Delete an expense (owner correcting a mistake). */
export const DELETE = handler(async (_request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { error } = await db().from('expenses').delete().eq('id', Number(id));
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true });
});
