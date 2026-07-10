-- TindaPOS schema — mirrors the original Laravel migrations 1:1.
-- Run in the Supabase SQL editor, or `supabase db push` with the CLI.

create table categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table employees (
  id bigint generated always as identity primary key,
  name text not null,
  pin char(4) not null unique check (pin ~ '^[0-9]{4}$'),
  role text not null default 'cashier' check (role in ('cashier', 'manager', 'owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table items (
  id bigint generated always as identity primary key,
  name text not null,
  sku text not null unique,
  category_id bigint references categories (id) on delete set null,
  cost numeric(10,2) not null default 0,
  price numeric(10,2) not null default 0,
  stock integer not null default 0,
  low_stock integer not null default 5,
  color text not null default '#1F6E4E',
  image text, -- storage path in the item-images bucket
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sales (
  id bigint generated always as identity primary key,
  employee_id bigint references employees (id) on delete set null,
  subtotal numeric(10,2) not null,
  discount_pct numeric(5,2) not null default 0,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card')),
  tendered numeric(10,2) not null default 0,
  change_due numeric(10,2) not null default 0,
  refunded boolean not null default false,
  created_at timestamptz not null default now() -- the sale timestamp; sales are never deleted
);

create table sale_items (
  id bigint generated always as identity primary key,
  sale_id bigint not null references sales (id) on delete cascade,
  item_id bigint references items (id) on delete set null,
  name text not null, -- snapshot, survives item edits/deletes
  price numeric(10,2) not null,
  qty integer not null
);

create table shifts (
  id bigint generated always as identity primary key,
  employee_id bigint not null references employees (id) on delete cascade,
  clock_in timestamptz not null,
  clock_out timestamptz,
  created_at timestamptz not null default now()
);

create table stock_adjustments (
  id bigint generated always as identity primary key,
  item_id bigint not null references items (id) on delete cascade,
  employee_id bigint references employees (id) on delete set null,
  reason text not null check (reason in ('receive', 'recount', 'damage')),
  before_qty integer not null,
  after_qty integer not null,
  created_at timestamptz not null default now()
);

create index sales_created_at_idx on sales (created_at desc);
create index sale_items_sale_id_idx on sale_items (sale_id);
create index shifts_employee_clock_in_idx on shifts (employee_id, clock_in desc);

-- ─── Row Level Security ────────────────────────────────────────────────────
-- All access goes through Next.js route handlers using the service role key
-- (which bypasses RLS). Enabling RLS with no policies blocks the anon key
-- entirely, so the tables are unreachable from the public API.
alter table categories enable row level security;
alter table employees enable row level security;
alter table items enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table shifts enable row level security;
alter table stock_adjustments enable row level security;

-- ─── Transactional RPCs ────────────────────────────────────────────────────
-- Checkout: validates stock, decrements it, and records the sale atomically
-- (the Laravel version's DB::transaction + lockForUpdate, as a Postgres fn).
create or replace function create_sale(
  p_employee_id bigint,
  p_discount_pct numeric,
  p_payment_method text,
  p_tendered numeric,
  p_lines jsonb -- [{ "item_id": 1, "qty": 2 }, ...]
) returns bigint
language plpgsql
security definer
as $$
declare
  v_line record;
  v_item items%rowtype;
  v_subtotal numeric := 0;
  v_discount numeric;
  v_total numeric;
  v_sale_id bigint;
begin
  -- First pass: lock rows, validate stock, compute subtotal.
  for v_line in select (l->>'item_id')::bigint as item_id, (l->>'qty')::int as qty
                from jsonb_array_elements(p_lines) l
  loop
    select * into v_item from items where id = v_line.item_id for update;
    if not found then
      raise exception 'Item % not found', v_line.item_id;
    end if;
    if v_item.stock < v_line.qty then
      raise exception 'Not enough stock for %', v_item.name;
    end if;
    v_subtotal := v_subtotal + v_item.price * v_line.qty;
  end loop;

  v_discount := round(v_subtotal * coalesce(p_discount_pct, 0) / 100, 2);
  v_total := round(v_subtotal - v_discount, 2);

  if p_tendered < v_total then
    raise exception 'Amount tendered is less than the total';
  end if;

  insert into sales (employee_id, subtotal, discount_pct, discount, total,
                     payment_method, tendered, change_due, refunded)
  values (p_employee_id, v_subtotal, coalesce(p_discount_pct, 0), v_discount, v_total,
          p_payment_method, p_tendered, round(p_tendered - v_total, 2), false)
  returning id into v_sale_id;

  -- Second pass: snapshot lines and decrement stock.
  for v_line in select (l->>'item_id')::bigint as item_id, (l->>'qty')::int as qty
                from jsonb_array_elements(p_lines) l
  loop
    select * into v_item from items where id = v_line.item_id;
    insert into sale_items (sale_id, item_id, name, price, qty)
    values (v_sale_id, v_item.id, v_item.name, v_item.price, v_line.qty);
    update items set stock = stock - v_line.qty, updated_at = now() where id = v_item.id;
  end loop;

  return v_sale_id;
end;
$$;

-- Refund: flags the sale and returns every line's quantity back to stock.
create or replace function refund_sale(p_sale_id bigint) returns void
language plpgsql
security definer
as $$
declare
  v_refunded boolean;
begin
  select refunded into v_refunded from sales where id = p_sale_id for update;
  if not found then
    raise exception 'Sale not found';
  end if;
  if v_refunded then
    raise exception 'Already refunded';
  end if;

  update items i
  set stock = i.stock + li.qty, updated_at = now()
  from sale_items li
  where li.sale_id = p_sale_id and li.item_id = i.id;

  update sales set refunded = true where id = p_sale_id;
end;
$$;

-- ─── Read helpers ───────────────────────────────────────────────────────────
-- Employee list with all-time sales totals and last clock-in, in one query.
create or replace view employee_overview as
select
  e.*,
  coalesce((select count(*) from sales s where s.employee_id = e.id and not s.refunded), 0)::int as receipts_count,
  coalesce((select sum(s.total) from sales s where s.employee_id = e.id and not s.refunded), 0)::numeric(12,2) as sales_total,
  (select max(sh.clock_in) from shifts sh where sh.employee_id = e.id) as last_clock_in
from employees e;

-- Views bypass RLS, and this one contains PINs — keep it off the public API.
revoke all on employee_overview from anon, authenticated;

-- Header stats for the History screen.
create or replace function sales_stats() returns json
language sql
security definer
as $$
  select json_build_object(
    'receipts_count', (select count(*) from sales),
    'today_total', coalesce((select sum(total) from sales
                             where not refunded and created_at >= date_trunc('day', now())), 0),
    'all_time_total', coalesce((select sum(total) from sales where not refunded), 0)
  );
$$;

-- ─── Storage ────────────────────────────────────────────────────────────────
-- Public bucket for item photos, capped at 4 MB per file (same as Laravel's
-- max:4096 validation). Uploads happen server-side with the service role key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-images', 'item-images', true, 4194304,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
