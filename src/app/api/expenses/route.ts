import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** List expenses for a branch within an optional date range (inclusive). */
export const GET = handler(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams;
  const branchId = sp.get('branch_id');
  const from = sp.get('from');
  const to = sp.get('to');

  let query = db().from('expenses').select('*').order('spent_at', { ascending: false }).order('id', { ascending: false });
  if (branchId) query = query.eq('branch_id', branchId);
  if (from) query = query.gte('spent_at', from);
  if (to) query = query.lte('spent_at', to);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return NextResponse.json(data ?? []);
});

/** Record an expense. */
export const POST = handler(async (request: NextRequest) => {
  const body = await request.json();
  if (!body.branch_id) return fail('A branch is required');
  if (!body.category) return fail('A category is required');
  const amount = Number(body.amount);
  if (!(amount > 0)) return fail('Enter an amount greater than zero');

  const base = {
    branch_id: body.branch_id,
    category: String(body.category),
    amount,
    note: body.note?.trim() || null,
    spent_at: body.spent_at || new Date().toISOString().slice(0, 10),
    recorded_by: body.employee_id ?? null,
    recorded_by_name: body.employee_name ?? null,
  };
  const payment = body.payment_method === 'gcash' ? 'gcash' : 'cash';
  const source = body.fund_source === 'employee' ? 'employee' : 'sales';

  const insert = (row: Record<string, unknown>) => db().from('expenses').insert(row).select('*').single();
  let res = await insert({ ...base, payment_method: payment, fund_source: source });
  // Graceful fallbacks if a column isn't migrated yet (fund_source, then payment_method).
  if (res.error && /fund_source/i.test(res.error.message)) {
    res = await insert({ ...base, payment_method: payment });
  }
  if (res.error && /payment_method/i.test(res.error.message)) {
    res = await insert(base);
  }
  if (res.error) return fail(res.error.message);
  return NextResponse.json(res.data, { status: 201 });
});
