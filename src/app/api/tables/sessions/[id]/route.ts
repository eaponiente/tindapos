import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';
import { fetchSessionDetail } from '@/lib/tables';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Full detail of one table session (tables, running order by round, total). */
export const GET = handler(async (_request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const session = await fetchSessionDetail(Number(id));
  if (!session) return fail('Session not found', 404);
  return NextResponse.json(session);
});

/** Update editable session fields (currently the diner count). */
export const PATCH = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const body = await request.json();
  const patch: Record<string, unknown> = {};
  if (body.customer_count != null) patch.customer_count = Math.max(1, Number(body.customer_count) || 1);
  if (Object.keys(patch).length === 0) return fail('Nothing to update');

  const { error } = await db().from('table_sessions').update(patch).eq('id', Number(id));
  if (error) return fail(error.message);

  return NextResponse.json(await fetchSessionDetail(Number(id)));
});
