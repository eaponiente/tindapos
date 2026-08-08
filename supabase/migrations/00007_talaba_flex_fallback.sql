-- 00007_talaba_flex_fallback.sql
-- Automatic White→Red fallback for the uncoloured Talaba dishes.
--
--   * RED pool   = talaba items whose name has "red"   (share one count).
--   * WHITE pool = talaba items whose name has "white" (share one count).
--   * FLEX dishes = talaba items with NEITHER colour (Cheese, Kinilaw, Soup,
--     with Lato). Their displayed stock = White + Red (total oysters they can
--     use), and a sale consumes WHITE first, then RED for the remainder.
--
-- Redefines the trigger functions and the create_sale RPC. Apply after 00006
-- (or instead of it — this fully re-defines the logic). Safe to re-run.
--
-- ⚠️ TEST before real use: this changes how checkout deducts stock for the
-- flex dishes. Ring some up on a test branch and watch White drain then Red.

-- ─── A new talaba item joins its pool (flex = white + red) ──────────────────
create or replace function talaba_join_pool() returns trigger
language plpgsql
as $$
declare
  v_white int;
  v_red int;
begin
  if new.name ilike '%talaba%' then
    if new.name ilike '%red%' then
      new.stock := coalesce((select stock from items
        where branch_id = new.branch_id and name ilike '%talaba%' and name ilike '%red%'
        order by updated_at desc limit 1), new.stock);
    elsif new.name ilike '%white%' then
      new.stock := coalesce((select stock from items
        where branch_id = new.branch_id and name ilike '%talaba%' and name ilike '%white%'
        order by updated_at desc limit 1), new.stock);
    else
      select coalesce(min(stock), 0) into v_white from items
        where branch_id = new.branch_id and name ilike '%talaba%' and name ilike '%white%';
      select coalesce(min(stock), 0) into v_red from items
        where branch_id = new.branch_id and name ilike '%talaba%' and name ilike '%red%';
      new.stock := v_white + v_red;
    end if;
  end if;
  return new;
end;
$$;

-- ─── Keep each pool in sync, and recompute flex = white + red ───────────────
create or replace function talaba_sync_stock() returns trigger
language plpgsql
as $$
declare
  v_white int;
  v_red int;
begin
  if new.name ilike '%talaba%' and new.stock is distinct from old.stock then
    -- Mirror the change to the rest of this item's colour pool.
    if new.name ilike '%red%' then
      update items set stock = new.stock, updated_at = now()
      where branch_id = new.branch_id and name ilike '%talaba%' and name ilike '%red%'
        and id <> new.id and stock is distinct from new.stock;
    elsif new.name ilike '%white%' then
      update items set stock = new.stock, updated_at = now()
      where branch_id = new.branch_id and name ilike '%talaba%' and name ilike '%white%'
        and id <> new.id and stock is distinct from new.stock;
    end if;

    -- Recompute the flex dishes (no colour) = white + red.
    select coalesce(min(stock), 0) into v_white from items
      where branch_id = new.branch_id and name ilike '%talaba%' and name ilike '%white%';
    select coalesce(min(stock), 0) into v_red from items
      where branch_id = new.branch_id and name ilike '%talaba%' and name ilike '%red%';
    update items set stock = v_white + v_red, updated_at = now()
    where branch_id = new.branch_id and name ilike '%talaba%'
      and name not ilike '%red%' and name not ilike '%white%'
      and stock is distinct from (v_white + v_red);
  end if;
  return null;
end;
$$;

-- ─── Checkout: flex dishes consume White first, then Red ────────────────────
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
  v_is_flex boolean;
  v_white int;
  v_red int;
  v_take_white int;
  v_take_red int;
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

    v_is_flex := v_item.name ilike '%talaba%'
                 and v_item.name not ilike '%red%' and v_item.name not ilike '%white%';
    if v_is_flex then
      select coalesce(min(stock), 0) into v_white from items
        where branch_id = p_branch_id and name ilike '%talaba%' and name ilike '%white%';
      select coalesce(min(stock), 0) into v_red from items
        where branch_id = p_branch_id and name ilike '%talaba%' and name ilike '%red%';
      if greatest(v_white, 0) + greatest(v_red, 0) < v_line.qty then
        raise exception 'Not enough Talaba stock for %', v_item.name;
      end if;
    else
      if v_item.stock < v_line.qty then
        raise exception 'Not enough stock for %', v_item.name;
      end if;
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

  -- Snapshot lines + decrement stock.
  for v_line in select (l->>'item_id')::bigint as item_id, (l->>'qty')::int as qty
                from jsonb_array_elements(p_lines) l
  loop
    select * into v_item from items where id = v_line.item_id;
    insert into sale_items (sale_id, item_id, name, price, qty)
    values (v_sale_id, v_item.id, v_item.name, v_item.price, v_line.qty);

    v_is_flex := v_item.name ilike '%talaba%'
                 and v_item.name not ilike '%red%' and v_item.name not ilike '%white%';
    if v_is_flex then
      -- Consume White first, then Red. (Triggers recompute the flex display.)
      select coalesce(min(stock), 0) into v_white from items
        where branch_id = p_branch_id and name ilike '%talaba%' and name ilike '%white%';
      v_take_white := least(v_line.qty, greatest(v_white, 0));
      v_take_red := v_line.qty - v_take_white;
      if v_take_white > 0 then
        update items set stock = stock - v_take_white, updated_at = now()
        where branch_id = p_branch_id and name ilike '%talaba%' and name ilike '%white%';
      end if;
      if v_take_red > 0 then
        update items set stock = stock - v_take_red, updated_at = now()
        where branch_id = p_branch_id and name ilike '%talaba%' and name ilike '%red%';
      end if;
    else
      update items set stock = stock - v_line.qty, updated_at = now() where id = v_item.id;
    end if;
  end loop;

  return v_sale_id;
end;
$$;
