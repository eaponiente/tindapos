import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Owner audit trail. GET lists the most recent entries; POST records one. */
export const GET = handler(async () => {
  const { data, error } = await db()
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return fail(error.message, 500);
  return NextResponse.json(data ?? []);
});

export const POST = handler(async (request: NextRequest) => {
  const body = await request.json();
  if (!String(body.action ?? '').trim()) return fail('action is required');

  const { data, error } = await db()
    .from('activity_logs')
    .insert({
      actor_id: body.actor_id ?? null,
      actor_name: String(body.actor_name ?? 'Unknown'),
      action: String(body.action).trim(),
      detail: body.detail ? String(body.detail) : null,
    })
    .select('*')
    .single();
  if (error) return fail(error.message, 500);
  return NextResponse.json(data, { status: 201 });
});
