import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** The restaurant floor plan: every physical table with its live status,
 *  derived from any active session (table_floor view). Branch-scoped. */
export const GET = handler(async (request: NextRequest) => {
  const branchId = request.nextUrl.searchParams.get('branch_id');
  if (!branchId) return fail('A branch is required');

  const { data, error } = await db()
    .from('table_floor')
    .select('*')
    .eq('branch_id', branchId)
    .order('table_number');
  if (error) return fail(error.message, 500);

  return NextResponse.json(data ?? []);
});

/** Add a physical table to a branch's floor. The number defaults to the next
 *  free one; capacity defaults to 4. Owner-facing (UI-gated on the client). */
export const POST = handler(async (request: NextRequest) => {
  const body = await request.json();
  const branchId = Number(body.branch_id);
  if (!branchId) return fail('A branch is required');

  const capacity = Math.min(50, Math.max(1, Math.round(Number(body.capacity)) || 4));

  let number = Math.round(Number(body.table_number));
  if (!number || number < 1) {
    const { data: top } = await db()
      .from('restaurant_tables')
      .select('table_number')
      .eq('branch_id', branchId)
      .order('table_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    number = (top?.table_number ?? 0) + 1;
  }

  const { data, error } = await db()
    .from('restaurant_tables')
    .insert({ branch_id: branchId, table_number: number, capacity })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') return fail(`Table ${number} already exists on this branch.`);
    return fail(error.message);
  }

  return NextResponse.json(data, { status: 201 });
});
