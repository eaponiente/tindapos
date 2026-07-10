import { NextRequest, NextResponse } from 'next/server';
import { db, fail, friendlyDbError, handler } from '@/lib/server';
import { validateEmployee } from '@/lib/validators';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const body = await request.json();
  const invalid = validateEmployee(body);
  if (invalid) return fail(invalid);

  const { data, error } = await db()
    .from('employees')
    .update({ name: body.name, pin: body.pin, role: body.role, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return fail(friendlyDbError(error, 'PIN'));

  return NextResponse.json(data);
});

export const DELETE = handler(async (_request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { error } = await db().from('employees').delete().eq('id', id);
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true });
});
