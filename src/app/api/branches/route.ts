import { NextRequest, NextResponse } from 'next/server';
import { db, fail, friendlyDbError, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const { data, error } = await db().from('branches').select('*').order('name');
  if (error) return fail(error.message, 500);
  return NextResponse.json(data);
});

export const POST = handler(async (request: NextRequest) => {
  const { name, address } = await request.json();
  if (!String(name ?? '').trim()) return fail('Branch name is required');

  const { data, error } = await db()
    .from('branches')
    .insert({ name: String(name).trim(), address: address ? String(address).trim() : null })
    .select('*')
    .single();
  if (error) return fail(friendlyDbError(error, 'branch name'));

  return NextResponse.json(data, { status: 201 });
});
