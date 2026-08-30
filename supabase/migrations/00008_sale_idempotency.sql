-- 00008_sale_idempotency.sql
-- Guards against duplicate sales from double-taps or retries on a slow
-- connection. The checkout route claims a per-attempt key here BEFORE creating
-- the sale; if the same key comes in again (the cashier tapped twice, or the
-- request was retried), the route returns the sale that was already created
-- instead of ringing up a second one. Apply after 00007. Safe to re-run.

create table if not exists sale_idempotency (
  key text primary key,
  sale_id bigint references sales (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table sale_idempotency enable row level security;
