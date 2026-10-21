-- 00025_talaba_oyster_type.sql
-- Structured oyster type for PRECISE per-type Talaba stock.
--
-- Replaces the old name-based pooling (red = name has "red", white = otherwise)
-- and the White->Red "flex" fallback with explicit, STRICT per-type pools:
--     talaba_type = 'red' | 'white' | 'tawi_tawi'  (or null = not a typed oyster)
-- Items of the same type at a branch share ONE synced stock count. Tawi-Tawi is
-- now its own independent pool (previously it silently drained White then Red).
--
-- Because pooled items share stock, create_sale returns to simple per-item
-- deduction — the sync trigger keeps the whole pool consistent after each sale.
--
-- ⚠️ AFTER RUNNING:
--   • Tawi-Tawi items inherit the old (White+Red) number — set the REAL Tawi-Tawi
--     opening count on any one Tawi-Tawi item; it syncs to the rest.
--   • Review each Talaba item's type with the new dropdown (dishes default to
--     White — the documented house default).
-- Idempotent. Apply after 00024.

-- 1) Column + allowed values ------------------------------------------------
alter table items add column if not exists talaba_type text;
do $$ begin
  alter table items add constraint items_talaba_type_chk
    check (talaba_type in ('red','white','tawi_tawi'));
exception when duplicate_object then null; end $$;

-- 2) One-time backfill from existing names (fills only nulls, so re-runs are
--    safe and never clobber a type the owner has since set by hand).
update items set talaba_type = 'tawi_tawi'
  where talaba_type is null and name ilike '%talaba%' and name ilike '%tawi%';
update items set talaba_type = 'red'
  where talaba_type is null and name ilike '%talaba%' and name ilike '%red%';
update items set talaba_type = 'white'
  where talaba_type is null and name ilike '%talaba%' and name ilike '%white%';
update items set talaba_type = 'white'   -- uncoloured dishes: house default
  where talaba_type is null and name ilike '%talaba%';

-- 3) Pool join: a typed item adopts its (branch, type) pool's current count, on
--    insert and whenever its type changes (so re-tagging an item re-pools it).
create or replace function talaba_join_pool() returns trigger
language plpgsql as $$
declare v_cnt int;
begin
  if new.talaba_type is not null
     and (tg_op = 'INSERT' or new.talaba_type is distinct from old.talaba_type) then
    select stock into v_cnt from items
      where branch_id = new.branch_id and talaba_type = new.talaba_type and id <> new.id
      order by updated_at desc limit 1;
    if v_cnt is not null then new.stock := v_cnt; end if;
  end if;
  return new;
end $$;
drop trigger if exists talaba_join_pool_trg on items;
create trigger talaba_join_pool_trg
  before insert or update on items
  for each row execute function talaba_join_pool();

-- 4) Pool sync: a stock change mirrors to the rest of the same (branch, type)
--    pool. The "is distinct" guard stops the cascade once every row is equal.
create or replace function talaba_sync_stock() returns trigger
language plpgsql as $$
begin
  if new.talaba_type is not null and new.stock is distinct from old.stock then
    update items set stock = new.stock, updated_at = now()
      where branch_id = new.branch_id and talaba_type = new.talaba_type
        and id <> new.id and stock is distinct from new.stock;
  end if;
  return null;
end $$;
drop trigger if exists talaba_sync_stock_trg on items;
create trigger talaba_sync_stock_trg
  after update of stock on items
  for each row execute function talaba_sync_stock();

-- 5) Checkout: plain per-item deduction (no flex). Pooled items share stock, so
--    one deduction + the sync trigger reconciles the whole pool. Identical to a
--    normal item otherwise.
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

  -- Validate + subtotal.
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

  -- Snapshot lines + decrement stock (re-read each item so same-pool lines in
  -- one sale deduct cumulatively via the sync trigger).
  for v_line in select (l->>'item_id')::bigint as item_id, (l->>'qty')::int as qty
                from jsonb_array_elements(p_lines) l
  loop
    select * into v_item from items where id = v_line.item_id;
    insert into sale_items (sale_id, item_id, name, price, qty)
    values (v_sale_id, v_item.id, v_item.name, v_item.price, v_line.qty);
    update items set stock = stock - v_line.qty, updated_at = now() where id = v_item.id;
  end loop;

  return v_sale_id;
end $$;
