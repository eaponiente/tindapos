import { NextRequest, NextResponse } from 'next/server';
import { db, fail, friendlyDbError, handler } from '@/lib/server';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { name } = await request.json();
  if (!String(name ?? '').trim()) return fail('Name is required');

  const { data, error } = await db()
    .from('categories')
    .update({ name: String(name).trim(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return fail(friendlyDbError(error, 'category name'));

  return NextResponse.json(data);
});

export const DELETE = handler(async (_request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  // items.category_id is ON DELETE SET NULL — items become uncategorized.
  const { error } = await db().from('categories').delete().eq('id', id);
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true });
});
