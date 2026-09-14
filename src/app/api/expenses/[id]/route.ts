import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Delete an expense (owner correcting a mistake). */
export const DELETE = handler(async (_request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const { error } = await db().from('expenses').delete().eq('id', Number(id));
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true });
});
