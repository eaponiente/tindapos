-- 00004_activity_and_employee_snapshot.sql
--  1. sales.employee_name — snapshots the cashier's name on each sale, so a
--     deleted employee's receipts still show who rang them up (History preview).
--  2. activity_logs — an owner-visible audit trail of staff/catalog changes.
-- Apply after 00003, in the Supabase SQL editor. Safe to re-run.

-- ─── 1. Retain the cashier name on sales ────────────────────────────────────
alter table sales add column if not exists employee_name text;

-- Backfill existing sales from the current employee record.
update sales s
set employee_name = e.name
from employees e
where s.employee_id = e.id and s.employee_name is null;

-- Record the cashier's name at checkout time (create_sale gains employee_name).
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
  v_emp_name text;
begin
  if p_branch_id is null then
    raise exception 'A branch is required';
  end if;

  select name into v_emp_name from employees where id = p_employee_id;

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

  insert into sales (employee_id, employee_name, branch_id, subtotal, discount_pct, discount, total,
                     payment_method, tendered, change_due, refunded)
  values (p_employee_id, v_emp_name, p_branch_id, v_subtotal, coalesce(p_discount_pct, 0), v_discount, v_total,
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

-- ─── 2. Activity log (owner audit trail) ────────────────────────────────────
create table if not exists activity_logs (
  id bigint generated always as identity primary key,
  actor_id bigint references employees (id) on delete set null,
  actor_name text not null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
alter table activity_logs enable row level security;
create index if not exists activity_logs_created_idx on activity_logs (created_at desc);
