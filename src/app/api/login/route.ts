import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** PIN clock-in. Opens a new shift and returns the employee. */
export const POST = handler(async (request: NextRequest) => {
  const { pin } = await request.json();
  if (!/^\d{4}$/.test(String(pin ?? ''))) return fail('Enter your 4-digit PIN');

  const { data: employee } = await db()
    .from('employees')
    .select('*')
    .eq('pin', pin)
    .maybeSingle();

  if (!employee) return fail('Wrong PIN');

  const { data: shift, error } = await db()
    .from('shifts')
    .insert({ employee_id: employee.id, clock_in: new Date().toISOString() })
    .select('id')
    .single();
  if (error) return fail(error.message);

  return NextResponse.json({ employee, shift_id: shift.id });
});
