import { db } from '@/lib/server';
import type { TableSession, TableSessionItem } from '@/lib/types';

/** Assemble one table session (the open tab) with its currently-occupied
 *  tables, running order lines, and total. Returns null if not found. */
export async function fetchSessionDetail(id: number): Promise<TableSession | null> {
  const { data: session } = await db().from('table_sessions').select('*').eq('id', id).maybeSingle();
  if (!session) return null;

  const { data: assignments } = await db()
    .from('table_session_tables')
    .select('table_id, released_at, restaurant_tables(table_number)')
    .eq('session_id', id)
    .is('released_at', null);

  const { data: items } = await db()
    .from('table_session_items')
    .select('*')
    .eq('session_id', id)
    .order('round')
    .order('id');

  const tables = (assignments ?? [])
    .map((a) => ({
      table_id: a.table_id as number,
      // Supabase types the embedded relation as an array; grab the number.
      table_number: (a.restaurant_tables as unknown as { table_number: number } | null)?.table_number ?? 0,
    }))
    .sort((x, y) => x.table_number - y.table_number);

  const lines = (items ?? []) as TableSessionItem[];
  const total = lines.reduce((sum, l) => sum + Number(l.price) * l.qty, 0);

  return {
    ...session,
    tables,
    tables_label: tables.map((t) => t.table_number).join(' + '),
    items: lines,
    total,
  } as TableSession;
}
