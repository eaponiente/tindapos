import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Clock-out: closes the employee's latest open shift. */
export const POST = handler(async (request: NextRequest) => {
  const { employee_id } = await request.json();
  if (!employee_id) return fail('employee_id is required');

  const { data: shift } = await db()
    .from('shifts')
    .select('id')
    .eq('employee_id', employee_id)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (shift) {
    await db().from('shifts').update({ clock_out: new Date().toISOString() }).eq('id', shift.id);
  }

  return NextResponse.json({ ok: true });
});
