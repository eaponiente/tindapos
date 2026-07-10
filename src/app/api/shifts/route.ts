import { NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Latest 30 shift punches, for the timesheet table. */
export const GET = handler(async () => {
  const { data, error } = await db()
    .from('shifts')
    .select('*, employee:employees(id, name)')
    .order('clock_in', { ascending: false })
    .limit(30);
  if (error) return fail(error.message, 500);
  return NextResponse.json(data);
});
