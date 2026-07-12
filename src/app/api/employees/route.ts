import { NextRequest, NextResponse } from 'next/server';
import { db, fail, friendlyDbError, handler } from '@/lib/server';
import { validateEmployee } from '@/lib/validators';

export const dynamic = 'force-dynamic';

/** Employee list with all-time totals + last clock-in (employee_overview view). */
export const GET = handler(async (request: NextRequest) => {
  const branchId = request.nextUrl.searchParams.get('branch_id');
  let query = db().from('employee_overview').select('*').order('name');
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return NextResponse.json(data);
});

export const POST = handler(async (request: NextRequest) => {
  const body = await request.json();
  const invalid = validateEmployee(body);
  if (invalid) return fail(invalid);

  const { data, error } = await db()
    .from('employees')
    .insert({ name: body.name, pin: body.pin, role: body.role, branch_id: body.branch_id ?? null })
    .select('*')
    .single();
  if (error) return fail(friendlyDbError(error, 'PIN'));

  return NextResponse.json(data, { status: 201 });
});
