-- 00012_sales_tags_and_item_edit.sql
--  1. Tag sales with an order type + table label + optional customer name, so
--     receipts and History can show "Table 3 + 4" (and, later, Take-out /
--     Delivery / Pick-up). Additive nullable columns; existing sales stay null.
--  2. Let a cashier edit/remove an item on an OPEN table before payment
--     (fixing a mis-tap), with the stock reservation kept correct.
-- Apply after 00011, in the Supabase SQL editor. Safe to re-run.

-- ─── 1. Sale tags ───────────────────────────────────────────────────────────
alter table sales add column if not exists order_type text;
alter table sales add column if not exists table_label text;
alter table sales add column if not exists customer_name text;

-- close_table_session: stamp the sale as dine-in with its table label.
create or replace function close_table_session(
  p_session_id bigint, p_payment_method text, p_tendered numeric, p_discount_pct numeric, p_employee_id bigint
) returns bigint
language plpgsql security definer as $$
declare v_status text; v_branch bigint; v_lines jsonb; v_sale bigint; v_name text; v_labels text;
begin
  select status, branch_id into v_status, v_branch from table_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if v_status = 'closed' then raise exception 'This session is already paid'; end if;
  if v_status = 'void' then raise exception 'This session was voided'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty)), '[]'::jsonb)
    into v_lines
  from (
    select item_id, sum(qty) as qty
      from table_session_items
     where session_id = p_session_id and item_id is not null
     group by item_id
  ) s;
  if v_lines = '[]'::jsonb then raise exception 'This table has no items to pay for'; end if;

  v_sale := create_sale(p_employee_id, coalesce(p_discount_pct, 0), p_payment_method, p_tendered, v_lines, v_branch);

  select string_agg(rt.table_number::text, ' + ' order by rt.table_number) into v_labels
    from table_session_tables tst join restaurant_tables rt on rt.id = tst.table_id
   where tst.session_id = p_session_id and tst.released_at is null;

  update sales set order_type = 'dine_in', table_label = v_labels where id = v_sale;

  update table_session_tables set released_at = now()
   where session_id = p_session_id and released_at is null;
  update table_sessions
     set status = 'closed', closed_at = now(), sale_id = v_sale
   where id = p_session_id;

  select name into v_name from employees where id = p_employee_id;
  insert into activity_logs (actor_id, actor_name, action, detail)
  values (p_employee_id, coalesce(v_name, '—'), 'Paid table bill',
          format('Session #%s (Table %s) → receipt #%s', p_session_id, coalesce(v_labels,'—'), v_sale));
  return v_sale;
end $$;

-- ─── 2. Edit / remove an item line on an open table ─────────────────────────
-- p_qty <= 0 removes the line; otherwise it sets the new quantity (re-checking
-- the stock reservation, excluding this line's own current quantity).
create or replace function update_session_item(p_line_id bigint, p_qty int, p_employee_id bigint)
returns void language plpgsql security definer as $$
declare
  v_session bigint; v_status text; v_branch bigint; v_item bigint; v_name text; v_itemname text;
  v_stock int; v_reserved int;
begin
  select tsi.session_id, tsi.item_id, tsi.name, ts.status, ts.branch_id
    into v_session, v_item, v_itemname, v_status, v_branch
    from table_session_items tsi
    join table_sessions ts on ts.id = tsi.session_id
   where tsi.id = p_line_id
   for update;
  if not found then raise exception 'Order line not found'; end if;
  if v_status not in ('open', 'for_payment') then raise exception 'This session is not open'; end if;

  select name into v_name from employees where id = p_employee_id;

  if coalesce(p_qty, 0) <= 0 then
    delete from table_session_items where id = p_line_id;
    insert into activity_logs (actor_id, actor_name, action, detail)
    values (p_employee_id, coalesce(v_name, '—'), 'Removed table item',
            format('Session #%s: removed %s', v_session, v_itemname));
    return;
  end if;

  -- Stock reservation check across open tables, excluding this line's own qty.
  if v_item is not null then
    select stock into v_stock from items where id = v_item;
    select coalesce(sum(tsi.qty), 0) into v_reserved
      from table_session_items tsi
      join table_sessions ts on ts.id = tsi.session_id
     where ts.branch_id = v_branch and ts.status in ('open', 'for_payment')
       and tsi.item_id = v_item and tsi.id <> p_line_id;
    if v_reserved + p_qty > coalesce(v_stock, 0) then
      raise exception 'Only % of % left', greatest(coalesce(v_stock,0) - v_reserved, 0), v_itemname;
    end if;
  end if;

  update table_session_items set qty = p_qty where id = p_line_id;
  insert into activity_logs (actor_id, actor_name, action, detail)
  values (p_employee_id, coalesce(v_name, '—'), 'Edited table item',
          format('Session #%s: %s x%s', v_session, v_itemname, p_qty));
end $$;
