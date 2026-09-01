-- 00013_order_sessions.sql
-- Take-out / Delivery / Pick-up as open "order tickets": the same session
-- engine as dine-in tables (rounds, item edit, stock reservation, pay-at-end),
-- but with NO physical table and a customer record instead. Apply after 00012.
-- Safe to re-run.

-- ─── Session gains a service type + customer details ────────────────────────
alter table table_sessions add column if not exists service_type text not null default 'dine_in';
alter table table_sessions add column if not exists customer_name text;
alter table table_sessions add column if not exists customer_phone text;
alter table table_sessions add column if not exists customer_address text;
alter table table_sessions add column if not exists customer_landmark text;

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where constraint_name = 'table_sessions_service_type_chk'
  ) then
    alter table table_sessions add constraint table_sessions_service_type_chk
      check (service_type in ('dine_in', 'take_out', 'delivery', 'pick_up'));
  end if;
end $$;

create index if not exists table_sessions_service_idx on table_sessions (branch_id, service_type, status);

-- ─── Open a non-dine-in order ticket (no table) ─────────────────────────────
create or replace function open_order_session(
  p_branch_id bigint, p_service_type text, p_customer_count int,
  p_name text, p_phone text, p_address text, p_landmark text, p_employee_id bigint
) returns bigint
language plpgsql security definer as $$
declare v_session bigint; v_name text;
begin
  if p_service_type not in ('take_out', 'delivery', 'pick_up') then
    raise exception 'Invalid order type';
  end if;
  select name into v_name from employees where id = p_employee_id;

  insert into table_sessions
    (branch_id, customer_count, service_type, customer_name, customer_phone,
     customer_address, customer_landmark, opened_by, opened_by_name)
  values
    (p_branch_id, greatest(coalesce(p_customer_count, 1), 1), p_service_type,
     nullif(trim(coalesce(p_name, '')), ''), nullif(trim(coalesce(p_phone, '')), ''),
     nullif(trim(coalesce(p_address, '')), ''), nullif(trim(coalesce(p_landmark, '')), ''),
     p_employee_id, v_name)
  returning id into v_session;

  insert into activity_logs (actor_id, actor_name, action, detail)
  values (p_employee_id, coalesce(v_name, '—'), 'Opened ' || replace(p_service_type, '_', '-') || ' order',
          format('Order #%s%s', v_session,
                 case when p_name is not null and trim(p_name) <> '' then ' — ' || p_name else '' end));
  return v_session;
end $$;

-- ─── close_table_session: stamp the sale with the session's service type ────
create or replace function close_table_session(
  p_session_id bigint, p_payment_method text, p_tendered numeric, p_discount_pct numeric, p_employee_id bigint
) returns bigint
language plpgsql security definer as $$
declare
  v_status text; v_branch bigint; v_service text; v_customer text;
  v_lines jsonb; v_sale bigint; v_name text; v_labels text;
begin
  select status, branch_id, service_type, customer_name
    into v_status, v_branch, v_service, v_customer
    from table_sessions where id = p_session_id for update;
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
  if v_lines = '[]'::jsonb then raise exception 'This order has no items to pay for'; end if;

  v_sale := create_sale(p_employee_id, coalesce(p_discount_pct, 0), p_payment_method, p_tendered, v_lines, v_branch);

  if coalesce(v_service, 'dine_in') = 'dine_in' then
    select string_agg(rt.table_number::text, ' + ' order by rt.table_number) into v_labels
      from table_session_tables tst join restaurant_tables rt on rt.id = tst.table_id
     where tst.session_id = p_session_id and tst.released_at is null;
  else
    v_labels := null;
  end if;

  update sales
     set order_type = coalesce(v_service, 'dine_in'), table_label = v_labels, customer_name = v_customer
   where id = v_sale;

  update table_session_tables set released_at = now()
   where session_id = p_session_id and released_at is null;
  update table_sessions
     set status = 'closed', closed_at = now(), sale_id = v_sale
   where id = p_session_id;

  select name into v_name from employees where id = p_employee_id;
  insert into activity_logs (actor_id, actor_name, action, detail)
  values (p_employee_id, coalesce(v_name, '—'), 'Paid bill',
          format('%s #%s → receipt #%s',
                 case when coalesce(v_service,'dine_in') = 'dine_in' then 'Table ' || coalesce(v_labels,'—')
                      else replace(coalesce(v_service,''), '_', '-') || ' order' end,
                 p_session_id, v_sale));
  return v_sale;
end $$;
