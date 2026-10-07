import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler } from '@/lib/server';
import type { KitchenOrder } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Food orders the kitchen prepares. Employee tabs are excluded (staff running
// tabs, not kitchen tickets).
const FOOD_TYPES = ['dine_in', 'take_out', 'delivery', 'pick_up'];

/** Active orders still cooking, oldest first (longest-waiting at the top).
 *  One row per open/for-payment session that has food and isn't kitchen-done. */
export const GET = handler(async (request: NextRequest) => {
  const branchId = request.nextUrl.searchParams.get('branch_id');
  if (!branchId) return fail('A branch is required');

  // Resilient to a DB that hasn't run migration 00024 yet: if kitchen_done_at
  // is missing, fall back to the filter without it (nothing is completed yet).
  const sessionCols = 'id, service_type, customer_name, customer_count, opened_at';
  const baseSessions = () =>
    db()
      .from('table_sessions')
      .select(sessionCols)
      .eq('branch_id', branchId)
      .in('status', ['open', 'for_payment'])
      .in('service_type', FOOD_TYPES)
      .order('opened_at', { ascending: true });
  let sessionsRes = await baseSessions().is('kitchen_done_at', null);
  if (sessionsRes.error) sessionsRes = await baseSessions();
  if (sessionsRes.error) return fail(sessionsRes.error.message, 500);
  const sessions = sessionsRes.data;

  const ids = (sessions ?? []).map((s) => s.id);
  if (ids.length === 0) return NextResponse.json([] as KitchenOrder[]);

  type RawItem = {
    id: number;
    session_id: number;
    name: string;
    qty: number;
    round: number;
    created_at: string;
    kitchen_status?: string | null;
  };
  let items: RawItem[] | null;
  {
    const withStatus = await db()
      .from('table_session_items')
      .select('id, session_id, name, qty, round, created_at, kitchen_status')
      .in('session_id', ids)
      .order('round')
      .order('id');
    if (withStatus.error) {
      const without = await db()
        .from('table_session_items')
        .select('id, session_id, name, qty, round, created_at')
        .in('session_id', ids)
        .order('round')
        .order('id');
      items = (without.data as unknown as RawItem[] | null) ?? null;
    } else {
      items = (withStatus.data as unknown as RawItem[] | null) ?? null;
    }
  }

  const { data: assigns } = await db()
    .from('table_session_tables')
    .select('session_id, restaurant_tables(table_number)')
    .in('session_id', ids)
    .is('released_at', null);

  const labels: Record<number, number[]> = {};
  for (const a of assigns ?? []) {
    const n = (a.restaurant_tables as unknown as { table_number: number } | null)?.table_number;
    if (n == null) continue;
    (labels[a.session_id as number] ??= []).push(n);
  }

  const bySession: Record<number, KitchenOrder['items']> = {};
  for (const it of items ?? []) {
    (bySession[it.session_id as number] ??= []).push({
      id: it.id as number,
      name: it.name as string,
      qty: it.qty as number,
      round: it.round as number,
      created_at: it.created_at as string,
      kitchen_status: (it.kitchen_status as KitchenOrder['items'][number]['kitchen_status']) ?? 'pending',
    });
  }

  const orders: KitchenOrder[] = (sessions ?? [])
    .map((s) => ({
      session_id: s.id as number,
      service_type: s.service_type,
      table_label: (labels[s.id as number] ?? []).sort((a, b) => a - b).join(' + '),
      customer_name: (s.customer_name as string | null) ?? null,
      customer_count: s.customer_count as number,
      opened_at: s.opened_at as string,
      items: bySession[s.id as number] ?? [],
    }))
    .filter((o) => o.items.length > 0);

  return NextResponse.json(orders);
});
