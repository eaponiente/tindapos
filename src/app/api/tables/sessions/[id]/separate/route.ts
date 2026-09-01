import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';
import { fetchSessionDetail } from '@/lib/tables';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** SEPARATE TABLES — release some tables while the session keeps running on
 *  the rest (must keep at least one). Released tables become available. */
export const POST = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const body = await request.json();
  const tableIds = Array.isArray(body.table_ids) ? body.table_ids.map(Number).filter(Boolean) : [];
  if (!body.employee_id) return fail('employee_id is required');
  if (tableIds.length === 0) return fail('Select at least one table to release');

  const { error } = await db().rpc('separate_table', {
    p_session_id: Number(id),
    p_release_table_ids: tableIds,
    p_employee_id: body.employee_id,
  });
  if (error) return fail(error.message);

  return NextResponse.json(await fetchSessionDetail(Number(id)));
});
