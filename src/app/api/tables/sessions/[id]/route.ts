import { NextRequest, NextResponse } from 'next/server';
import { fail, handler } from '@/lib/server';
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
