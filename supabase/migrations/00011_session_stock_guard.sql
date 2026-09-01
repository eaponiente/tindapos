-- 00011_session_stock_guard.sql
-- Stop a table from ordering more than is in stock BEFORE payment. Stock is
-- still only *deducted* at Pay Bill (create_sale) — but adding a round now
-- checks that everything already sitting on OPEN tables, plus what's being
-- added, does not exceed stock on hand. This is the reservation guard that
-- makes "X left" honest across rounds and across tables. Apply after 00010.
-- Safe to re-run. (Pooled Talaba dishes are still finally reconciled by
-- create_sale at Pay Bill; this per-item guard covers the common case.)

create or replace function add_session_round(p_session_id bigint, p_lines jsonb, p_employee_id bigint)
returns int language plpgsql security definer as $$
declare
  v_status text; v_branch bigint; v_round int; v_line record; v_item items%rowtype;
  v_name text; v_count int := 0; v_reserved int; v_left int;
begin
  select status, branch_id into v_status, v_branch from table_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if v_status not in ('open', 'for_payment') then raise exception 'This session is not open'; end if;

  select coalesce(max(round), 0) + 1 into v_round from table_session_items where session_id = p_session_id;

  -- Sum duplicate item lines within the round so the stock check sees the total.
  for v_line in select (l->>'item_id')::bigint as item_id, sum((l->>'qty')::int) as qty
                from jsonb_array_elements(p_lines) l
                group by (l->>'item_id')::bigint
  loop
    if coalesce(v_line.qty, 0) <= 0 then continue; end if;
    select * into v_item from items where id = v_line.item_id;
    if not found then raise exception 'Item % not found', v_line.item_id; end if;
    if v_item.branch_id <> v_branch then raise exception '% is not stocked at this branch', v_item.name; end if;

    -- Everything this item already has committed to open/for-payment tables at
    -- this branch (this session's earlier rounds included).
    select coalesce(sum(tsi.qty), 0) into v_reserved
      from table_session_items tsi
      join table_sessions ts on ts.id = tsi.session_id
     where ts.branch_id = v_branch
       and ts.status in ('open', 'for_payment')
       and tsi.item_id = v_line.item_id;

    if v_reserved + v_line.qty > v_item.stock then
      v_left := greatest(v_item.stock - v_reserved, 0);
      raise exception 'Only % of % left', v_left, v_item.name;
    end if;

    insert into table_session_items (session_id, item_id, name, price, qty, round)
    values (p_session_id, v_item.id, v_item.name, v_item.price, v_line.qty, v_round);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then raise exception 'No items to add'; end if;

  update table_sessions set status = 'open' where id = p_session_id and status = 'for_payment';

  select name into v_name from employees where id = p_employee_id;
  insert into activity_logs (actor_id, actor_name, action, detail)
  values (p_employee_id, coalesce(v_name, '—'), 'Added order round',
          format('Session #%s round %s (%s item lines)', p_session_id, v_round, v_count));
  return v_round;
end $$;
