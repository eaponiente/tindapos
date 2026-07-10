import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { data, error } = await db()
    .from('sales')
    .select('*, employee:employees(id, name), items:sale_items(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('Sale not found', 404);
  return NextResponse.json(data);
});
