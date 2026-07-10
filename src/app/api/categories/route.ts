import { NextRequest, NextResponse } from 'next/server';
import { db, fail, friendlyDbError, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const { data, error } = await db()
    .from('categories')
    .select('*, items(count)')
    .order('name');
  if (error) return fail(error.message, 500);

  // Flatten the embedded count to items_count, matching the old API shape.
  return NextResponse.json(
    (data ?? []).map(({ items, ...c }) => ({
      ...c,
      items_count: items?.[0]?.count ?? 0,
    })),
  );
});

export const POST = handler(async (request: NextRequest) => {
  const { name } = await request.json();
  if (!String(name ?? '').trim()) return fail('Name is required');

  const { data, error } = await db()
    .from('categories')
    .insert({ name: String(name).trim() })
    .select('*')
    .single();
  if (error) return fail(friendlyDbError(error, 'category name'));

  return NextResponse.json(data, { status: 201 });
});
