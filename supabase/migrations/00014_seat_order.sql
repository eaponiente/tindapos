-- 00014_seat_order.sql
-- Let a take-out / pick-up order become dine-in on the spot: the customer came
-- to collect but decided to eat in. Assigns the SAME open order to one or more
-- physical tables and flips it to dine_in — the order, items, and total stay
-- intact; it just moves onto the Tables floor and bills as a table. Apply after
-- 00013. Safe to re-run.

create or replace function seat_order_at_table(p_session_id bigint, p_table_ids bigint[], p_employee_id bigint)
returns void language plpgsql security definer as $$
declare v_branch bigint; v_status text; v_service text; v_tid bigint; v_name text; v_labels text;
begin
  select branch_id, status, service_type into v_branch, v_status, v_service
    from table_sessions where id = p_session_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_status <> 'open' then raise exception 'This order is not open'; end if;
  if v_service = 'dine_in' then raise exception 'This is already a dine-in order'; end if;
  if p_table_ids is null or array_length(p_table_ids, 1) is null then
    raise exception 'Select at least one table';
  end if;

  foreach v_tid in array p_table_ids loop
    if not exists (select 1 from restaurant_tables where id = v_tid and branch_id = v_branch) then
      raise exception 'Table not found at this branch';
    end if;
    begin
      insert into table_session_tables (session_id, table_id) values (p_session_id, v_tid);
    exception when unique_violation then
      raise exception 'Table % is already occupied. Please pick another table.',
        (select table_number from restaurant_tables where id = v_tid);
    end;
  end loop;

  update table_sessions set service_type = 'dine_in' where id = p_session_id;

  select name into v_name from employees where id = p_employee_id;
  select string_agg(rt.table_number::text, ' + ' order by rt.table_number) into v_labels
    from table_session_tables tst join restaurant_tables rt on rt.id = tst.table_id
   where tst.session_id = p_session_id and tst.released_at is null;

  insert into activity_logs (actor_id, actor_name, action, detail)
  values (p_employee_id, coalesce(v_name, '—'), 'Seated order at table',
          format('Order #%s → dine-in at Table %s', p_session_id, coalesce(v_labels, '—')));
end $$;
