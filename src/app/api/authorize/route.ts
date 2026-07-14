import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Verifies a PIN belongs to a manager or owner — used to authorize a cashier's
 *  refund. Read-only: unlike /login it opens no shift and has no side effects. */
export const POST = handler(async (request: NextRequest) => {
  const { pin } = await request.json();
  if (!/^\d{4,6}$/.test(String(pin ?? ''))) return fail('Enter a valid PIN');

  const { data: emp } = await db()
    .from('employees')
    .select('name, role')
    .eq('pin', pin)
    .maybeSingle();

  if (!emp || !['manager', 'owner'].includes(emp.role)) {
    return fail('That PIN is not a manager or owner', 403);
  }
  return NextResponse.json({ ok: true, name: emp.name, role: emp.role });
});
