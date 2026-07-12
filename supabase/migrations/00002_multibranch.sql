-- 00002_multibranch.sql — multi-branch support (one shared system, per-branch
-- stock). Apply AFTER 00001_init.sql, in the Supabase SQL editor or via
-- `supabase db push`. Written to be idempotent: it is safe to run more than
-- once (e.g. after a partial run), and it backfills every existing employee,
-- item, and sale to a seeded "Main Branch".

-- ─── Branches ───────────────────────────────────────────────────────────────
create table if not exists branches (
  id bigint generated always as identity primary key,
  name text not null unique,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table branches enable row level security;

insert into branches (name, address)
select 'Main Branch', 'Calinan, Davao City'
where not exists (select 1 from branches);

-- ─── branch_id columns ──────────────────────────────────────────────────────
-- employees: nullable — an owner can oversee all branches (no home branch).
alter table employees add column if not exists branch_id bigint references branches (id) on delete set null;
-- items: every item belongs to exactly one branch (per-branch stock).
alter table items add column if not exists branch_id bigint references branches (id) on delete cascade;
-- sales: the branch the sale was rung up at.
alter table sales add column if not exists branch_id bigint references branches (id) on delete set null;

-- Backfill any rows that don't have a branch yet to the seeded Main Branch.
update employees set branch_id = (select id from branches order by id limit 1) where branch_id is null;
update items    set branch_id = (select id from branches order by id limit 1) where branch_id is null;
update sales    set branch_id = (select id from branches order by id limit 1) where branch_id is null;

alter table items alter column branch_id set not null;

-- SKUs are unique per branch now, not globally.
alter table items drop constraint if exists items_sku_key;
alter table items drop constraint if exists items_branch_sku_key;
alter table items add constraint items_branch_sku_key unique (branch_id, sku);

create index if not exists items_branch_idx on items (branch_id);
create index if not exists sales_branch_created_idx on sales (branch_id, created_at desc);
create index if not exists employees_branch_idx on employees (branch_id);

-- ─── create_sale: records the branch and checks lines belong to it ──────────
drop function if exists create_sale(bigint, numeric, text, numeric, jsonb);

create or replace function create_sale(
  p_employee_id bigint,
  p_discount_pct numeric,
  p_payment_method text,
  p_tendered numeric,
  p_lines jsonb,
  p_branch_id bigint
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
  if p_branch_id is null then
    raise exception 'A branch is required';
  end if;

  for v_line in select (l->>'item_id')::bigint as item_id, (l->>'qty')::int as qty
                from jsonb_array_elements(p_lines) l
  loop
    select * into v_item from items where id = v_line.item_id for update;
    if not found then
      raise exception 'Item % not found', v_line.item_id;
    end if;
    if v_item.branch_id <> p_branch_id then
      raise exception '% is not stocked at this branch', v_item.name;
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

  insert into sales (employee_id, branch_id, subtotal, discount_pct, discount, total,
                     payment_method, tendered, change_due, refunded)
  values (p_employee_id, p_branch_id, v_subtotal, coalesce(p_discount_pct, 0), v_discount, v_total,
          p_payment_method, p_tendered, round(p_tendered - v_total, 2), false)
  returning id into v_sale_id;

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

-- ─── employee_overview: dropped + recreated so column order can change ──────
-- (CREATE OR REPLACE VIEW can only append columns; adding branch_id to the
--  employees table shifted e.*, so we drop and recreate instead.)
drop view if exists employee_overview;

create view employee_overview as
select
  e.*,
  b.name as branch_name,
  coalesce((select count(*) from sales s where s.employee_id = e.id and not s.refunded), 0)::int as receipts_count,
  coalesce((select sum(s.total) from sales s where s.employee_id = e.id and not s.refunded), 0)::numeric(12,2) as sales_total,
  (select max(sh.clock_in) from shifts sh where sh.employee_id = e.id) as last_clock_in
from employees e
left join branches b on b.id = e.branch_id;

revoke all on employee_overview from anon, authenticated;

-- ─── sales_stats: optional branch filter (null = all branches) ──────────────
drop function if exists sales_stats();

create or replace function sales_stats(p_branch_id bigint default null) returns json
language sql
security definer
as $$
  select json_build_object(
    'receipts_count', (select count(*) from sales
                       where p_branch_id is null or branch_id = p_branch_id),
    'today_total', coalesce((select sum(total) from sales
                             where not refunded and created_at >= date_trunc('day', now())
                               and (p_branch_id is null or branch_id = p_branch_id)), 0),
    'all_time_total', coalesce((select sum(total) from sales
                               where not refunded
                                 and (p_branch_id is null or branch_id = p_branch_id)), 0)
  );
$$;
