import { NextRequest, NextResponse } from 'next/server';
import { db, fail, friendlyDbError, handler } from '@/lib/server';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { name, address } = await request.json();
  if (!String(name ?? '').trim()) return fail('Branch name is required');

  const { data, error } = await db()
    .from('branches')
    .update({
      name: String(name).trim(),
      address: address ? String(address).trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return fail(friendlyDbError(error, 'branch name'));

  return NextResponse.json(data);
});
