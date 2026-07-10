// Server-only helpers for the API route handlers.
// The service role key bypasses RLS — it must never reach the client, which
// is why the env vars are not NEXT_PUBLIC_ and this module is only imported
// from route handlers.
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { Item, StockStatus } from './types';

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars');
    }
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export const IMAGE_BUCKET = 'item-images';

/** JSON error response in the shape the client expects ({ message }). */
export function fail(message: string, status = 422) {
  return NextResponse.json({ message }, { status });
}

/** Wraps a handler so thrown errors become clean JSON errors, not 500 HTML. */
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong';
      // Postgres RAISE EXCEPTION messages from our RPCs are user-facing
      // ("Not enough stock for X") — surface them as validation errors.
      return fail(message, 422);
    }
  };
}

type ItemRow = Omit<Item, 'image_url' | 'margin_pct' | 'status' | 'category'> & {
  category?: { id: number; name: string } | null;
};

/** Adds the computed fields the Laravel Item model appended. */
export function mapItem(row: ItemRow): Item {
  const price = Number(row.price);
  const cost = Number(row.cost);
  const status: StockStatus = row.stock <= 0 ? 'out' : row.stock <= row.low_stock ? 'low' : 'ok';
  return {
    ...row,
    cost,
    price,
    margin_pct: price <= 0 ? 0 : Math.round(((price - cost) / price) * 100),
    status,
    image_url: row.image
      ? db().storage.from(IMAGE_BUCKET).getPublicUrl(row.image).data.publicUrl
      : null,
    category: row.category ?? null,
  };
}

export const ITEM_SELECT = '*, category:categories(id, name)';

/** Translates unique-violation Postgres errors into friendly messages. */
export function friendlyDbError(error: { code?: string; message: string }, field: string): string {
  if (error.code === '23505') return `That ${field} is already taken`;
  return error.message;
}
