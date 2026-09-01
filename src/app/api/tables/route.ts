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
