-- 00016_employee_purchase.sql
-- "Employee purchase" — a staff member buying store goods, often on credit
-- (pay after closing). It reuses the whole order-ticket engine: open a ticket
-- for the buying employee, add items, apply a discount, then Pay Bill now OR
-- leave it open and settle later. The buyer's name is held in customer_name,
-- and the paid sale is stamped order_type = 'employee' by the existing
-- close_table_session (which already stamps order_type = service_type).
-- Apply after 00015, in the Supabase SQL editor. Safe to re-run.

-- Allow the new service type on sessions.
alter table table_sessions drop constraint if exists table_sessions_service_type_chk;
alter table table_sessions add constraint table_sessions_service_type_chk
  check (service_type in ('dine_in', 'take_out', 'delivery', 'pick_up', 'employee'));

-- open_order_session: accept 'employee' too (body otherwise unchanged from 00013).
create or replace function open_order_session(
  p_branch_id bigint, p_service_type text, p_customer_count int,
  p_name text, p_phone text, p_address text, p_landmark text, p_employee_id bigint
) returns bigint
language plpgsql security definer as $$
declare v_session bigint; v_name text;
begin
  if p_service_type not in ('take_out', 'delivery', 'pick_up', 'employee') then
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
  values (p_employee_id, coalesce(v_name, '—'),
          'Opened ' || replace(p_service_type, '_', '-') || ' order',
          format('Order #%s%s', v_session,
                 case when p_name is not null and trim(p_name) <> '' then ' — ' || p_name else '' end));
  return v_session;
end $$;
