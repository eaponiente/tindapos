-- 00010_restaurant_tables.sql
-- Restaurant table management + open "table sessions" (dine-in). FULLY ADDITIVE:
-- no existing table, column, view, or function is changed. A table session is
-- an OPEN order that grows across rounds and is paid at the end by handing its
-- items to the EXISTING create_sale RPC — so checkout, stock decrement, the
-- Talaba pool logic, receipts, History, reports, and refunds are all unchanged.
--
-- Stock is deducted at PAY BILL (create_sale), not per round.
-- Apply after 00009, in the Supabase SQL editor. Safe to re-run.

-- ─── Physical tables (permanent; 12 per restaurant floor) ───────────────────
create table if not exists restaurant_tables (
  id bigint generated always as identity primary key,
  branch_id bigint not null references branches (id) on delete cascade,
  table_number int not null,
  capacity int not null default 4,
  grid_x int,                 -- optional floor-plan coordinates (null = auto grid)
  grid_y int,
  created_at timestamptz not null default now(),
  unique (branch_id, table_number)
);
alter table restaurant_tables enable row level security;

-- ─── Table sessions (the open tab / customer group) ─────────────────────────
create table if not exists table_sessions (
  id bigint generated always as identity primary key,
  branch_id bigint not null references branches (id) on delete cascade,
  customer_count int not null default 1,
  status text not null default 'open' check (status in ('open','for_payment','closed','void')),
  opened_by bigint references employees (id) on delete set null,
  opened_by_name text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  sale_id bigint references sales (id) on delete set null  -- the receipt, once paid
);
alter table table_sessions enable row level security;
create index if not exists table_sessions_branch_status_idx on table_sessions (branch_id, status);

-- ─── Which physical tables a session occupies (current + history) ───────────
create table if not exists table_session_tables (
  id bigint generated always as identity primary key,
  session_id bigint not null references table_sessions (id) on delete cascade,
  table_id bigint not null references restaurant_tables (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  released_at timestamptz              -- null = currently occupying this table
);
alter table table_session_tables enable row level security;
-- THE core safety guarantee, enforced by the database: a physical table can be
-- in at most ONE active (unreleased) assignment at a time. This makes double-
-- booking and two-cashier races impossible, not merely discouraged.
create unique index if not exists table_active_assignment_uniq
  on table_session_tables (table_id) where released_at is null;
create index if not exists tst_session_idx on table_session_tables (session_id);

-- ─── The accumulating order, grouped by round ───────────────────────────────
create table if not exists table_session_items (
  id bigint generated always as identity primary key,
  session_id bigint not null references table_sessions (id) on delete cascade,
  item_id bigint references items (id) on delete set null,
  name text not null,          -- snapshot, like sale_items
  price numeric(10,2) not null,
  qty int not null,
  round int not null default 1,
  created_at timestamptz not null default now()
);
alter table table_session_items enable row level security;
create index if not exists tsi_session_idx on table_session_items (session_id);

-- ─── Seed 12 tables for the Calinan branch (idempotent) ─────────────────────
do $$
declare
  v_branch bigint;
begin
  select id into v_branch from branches where name ilike '%calinan%' order by id limit 1;
  if v_branch is null then
    select id into v_branch from branches order by id limit 1; -- fallback: first branch
  end if;
  if v_branch is not null then
    insert into restaurant_tables (branch_id, table_number, capacity)
    select v_branch, g, 4 from generate_series(1, 12) g
    where not exists (
      select 1 from restaurant_tables t where t.branch_id = v_branch and t.table_number = g
    );
  end if;
end $$;

-- ─── Read helper: the floor plan (one row per physical table) ───────────────
-- status = AVAILABLE when no active session; otherwise the session's status.
create or replace view table_floor as
select
  rt.id            as table_id,
  rt.branch_id,
  rt.table_number,
  rt.capacity,
  rt.grid_x,
  rt.grid_y,
  ts.id            as session_id,
  ts.status        as session_status,
  ts.customer_count,
  ts.opened_at,
  (select string_agg(rt2.table_number::text, ' + ' order by rt2.table_number)
     from table_session_tables x
     join restaurant_tables rt2 on rt2.id = x.table_id
    where x.session_id = ts.id and x.released_at is null)          as session_tables_label,
  (select coalesce(sum(i.price * i.qty), 0)
     from table_session_items i where i.session_id = ts.id)        as order_total,
  (select coalesce(sum(i.qty), 0)
     from table_session_items i where i.session_id = ts.id)        as item_count
from restaurant_tables rt
left join table_session_tables tst
       on tst.table_id = rt.id and tst.released_at is null
left join table_sessions ts
       on ts.id = tst.session_id and ts.status in ('open', 'for_payment');

revoke all on table_floor from anon, authenticated;

-- ─── RPCs — every table mutation is one transaction, server-enforced ────────

-- Open a new session on one or more free tables.
create or replace function open_table_session(
  p_branch_id bigint, p_table_ids bigint[], p_customer_count int, p_employee_id bigint
) returns bigint
language plpgsql security definer as $$
declare
  v_session bigint;
  v_name text;
  v_tid bigint;
  v_labels text;
begin
  if p_table_ids is null or array_length(p_table_ids, 1) is null then
    raise exception 'Select at least one table';
  end if;
  select name into v_name from employees where id = p_employee_id;

  insert into table_sessions (branch_id, customer_count, opened_by, opened_by_name)
  values (p_branch_id, greatest(coalesce(p_customer_count, 1), 1), p_employee_id, v_name)
  returning id into v_session;

  foreach v_tid in array p_table_ids loop
    if not exists (select 1 from restaurant_tables where id = v_tid and branch_id = p_branch_id) then
      raise exception 'Table not found at this branch';
    end if;
    begin
      insert into table_session_tables (session_id, table_id) values (v_session, v_tid);
    exception when unique_violation then
      raise exception 'Table % is already occupied. Please pick another table.',
        (select table_number from restaurant_tables where id = v_tid);
    end;
  end loop;

  select string_agg(rt.table_number::text, ' + ' order by rt.table_number) into v_labels
    from table_session_tables tst join restaurant_tables rt on rt.id = tst.table_id
   where tst.session_id = v_session and tst.released_at is null;

  insert into activity_logs (actor_id, actor_name, action, detail)
  values (p_employee_id, coalesce(v_name, '—'), 'Opened table session',
          format('Session #%s: Table %s (%s pax)', v_session, v_labels, greatest(coalesce(p_customer_count,1),1)));

  return v_session;
end $$;

-- Add more free tables to an existing open session (COMBINE TABLES).
create or replace function combine_tables(p_session_id bigint, p_table_ids bigint[], p_employee_id bigint)
returns void language plpgsql security definer as $$
declare v_branch bigint; v_status text; v_tid bigint; v_name text; v_labels text;
begin
  select branch_id, status into v_branch, v_status from table_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if v_status <> 'open' then raise exception 'This session is not open'; end if;
  if p_table_ids is null or array_length(p_table_ids, 1) is null then
    raise exception 'Select at least one table to combine';
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

  select name into v_name from employees where id = p_employee_id;
  select string_agg(rt.table_number::text, ' + ' order by rt.table_number) into v_labels
    from table_session_tables tst join restaurant_tables rt on rt.id = tst.table_id
   where tst.session_id = p_session_id and tst.released_at is null;

  insert into activity_logs (actor_id, actor_name, action, detail)
  values (p_employee_id, coalesce(v_name, '—'), 'Combined tables',
          format('Session #%s now at Table %s', p_session_id, v_labels));
end $$;

-- Release some tables from a session but keep it running on the rest (SEPARATE).
create or replace function separate_table(p_session_id bigint, p_release_table_ids bigint[], p_employee_id bigint)
returns void language plpgsql security definer as $$
declare v_status text; v_active int; v_name text; v_released text; v_labels text;
begin
  select status into v_status from table_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if v_status <> 'open' then raise exception 'This session is not open'; end if;
  if p_release_table_ids is null or array_length(p_release_table_ids, 1) is null then
    raise exception 'Select at least one table to release';
  end if;

  select count(*) into v_active from table_session_tables
   where session_id = p_session_id and released_at is null;
  if v_active - array_length(p_release_table_ids, 1) < 1 then
    raise exception 'A session must keep at least one table. Use Pay Bill to close it instead.';
  end if;

  select string_agg(rt.table_number::text, ' + ' order by rt.table_number) into v_released
    from table_session_tables tst join restaurant_tables rt on rt.id = tst.table_id
   where tst.session_id = p_session_id and tst.released_at is null and tst.table_id = any(p_release_table_ids);

  update table_session_tables set released_at = now()
   where session_id = p_session_id and released_at is null and table_id = any(p_release_table_ids);

  select name into v_name from employees where id = p_employee_id;
  select string_agg(rt.table_number::text, ' + ' order by rt.table_number) into v_labels
    from table_session_tables tst join restaurant_tables rt on rt.id = tst.table_id
   where tst.session_id = p_session_id and tst.released_at is null;

  insert into activity_logs (actor_id, actor_name, action, detail)
  values (p_employee_id, coalesce(v_name, '—'), 'Separated tables',
          format('Session #%s released Table %s, now at Table %s', p_session_id, coalesce(v_released,'—'), v_labels));
end $$;

-- Move a whole session to a new set of tables (TRANSFER TABLE). All-or-nothing:
-- if any destination is occupied by another session, the whole move rolls back
-- and the original tables are kept — the order is never lost.
create or replace function transfer_session(p_session_id bigint, p_new_table_ids bigint[], p_employee_id bigint)
returns void language plpgsql security definer as $$
declare v_branch bigint; v_status text; v_tid bigint; v_name text; v_old text; v_new text;
begin
  select branch_id, status into v_branch, v_status from table_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if v_status <> 'open' then raise exception 'This session is not open'; end if;
  if p_new_table_ids is null or array_length(p_new_table_ids, 1) is null then
    raise exception 'Select at least one destination table';
  end if;

  select string_agg(rt.table_number::text, ' + ' order by rt.table_number) into v_old
    from table_session_tables tst join restaurant_tables rt on rt.id = tst.table_id
   where tst.session_id = p_session_id and tst.released_at is null;

  -- Release current tables first (within this txn) so a move that re-uses one of
  -- the session's own tables is allowed; then claim the new set.
  update table_session_tables set released_at = now()
   where session_id = p_session_id and released_at is null;

  foreach v_tid in array p_new_table_ids loop
    if not exists (select 1 from restaurant_tables where id = v_tid and branch_id = v_branch) then
      raise exception 'Table not found at this branch';
    end if;
    begin
      insert into table_session_tables (session_id, table_id) values (p_session_id, v_tid);
    exception when unique_violation then
      raise exception 'Table % is currently occupied. Please select another available table.',
        (select table_number from restaurant_tables where id = v_tid);
    end;
  end loop;

  select name into v_name from employees where id = p_employee_id;
  select string_agg(rt.table_number::text, ' + ' order by rt.table_number) into v_new
    from table_session_tables tst join restaurant_tables rt on rt.id = tst.table_id
   where tst.session_id = p_session_id and tst.released_at is null;

  insert into activity_logs (actor_id, actor_name, action, detail)
  values (p_employee_id, coalesce(v_name, '—'), 'Transferred table',
          format('Session #%s: Table %s → Table %s', p_session_id, coalesce(v_old,'—'), v_new));
end $$;

-- Add a round of items to the open order (ADD ORDER). Stock is NOT touched here
-- — it is validated and decremented at Pay Bill by create_sale.
create or replace function add_session_round(p_session_id bigint, p_lines jsonb, p_employee_id bigint)
returns int language plpgsql security definer as $$
declare v_status text; v_branch bigint; v_round int; v_line record; v_item items%rowtype; v_name text; v_count int := 0;
begin
  select status, branch_id into v_status, v_branch from table_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if v_status not in ('open', 'for_payment') then raise exception 'This session is not open'; end if;

  select coalesce(max(round), 0) + 1 into v_round from table_session_items where session_id = p_session_id;

  for v_line in select (l->>'item_id')::bigint as item_id, (l->>'qty')::int as qty
                from jsonb_array_elements(p_lines) l
  loop
    if coalesce(v_line.qty, 0) <= 0 then continue; end if;
    select * into v_item from items where id = v_line.item_id;
    if not found then raise exception 'Item % not found', v_line.item_id; end if;
    if v_item.branch_id <> v_branch then raise exception '% is not stocked at this branch', v_item.name; end if;
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

-- Pay the bill and close the session. Hands the accumulated items to the
-- existing create_sale RPC (stock validation + decrement + receipt + payment),
-- links the receipt, then frees every table automatically.
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

  -- Reuse the tested checkout exactly — same stock/Talaba/receipt behaviour as
  -- a quick sale. If stock is short, this raises and the close rolls back.
  v_sale := create_sale(p_employee_id, coalesce(p_discount_pct, 0), p_payment_method, p_tendered, v_lines, v_branch);

  select string_agg(rt.table_number::text, ' + ' order by rt.table_number) into v_labels
    from table_session_tables tst join restaurant_tables rt on rt.id = tst.table_id
   where tst.session_id = p_session_id and tst.released_at is null;

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

-- Cancel an open session without payment (guests left, mistake). No stock was
-- taken (Option A), so this just frees the tables and marks the session void.
create or replace function void_table_session(p_session_id bigint, p_employee_id bigint)
returns void language plpgsql security definer as $$
declare v_status text; v_name text; v_labels text;
begin
  select status into v_status from table_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if v_status = 'closed' then raise exception 'A paid session cannot be voided'; end if;

  select string_agg(rt.table_number::text, ' + ' order by rt.table_number) into v_labels
    from table_session_tables tst join restaurant_tables rt on rt.id = tst.table_id
   where tst.session_id = p_session_id and tst.released_at is null;

  update table_session_tables set released_at = now() where session_id = p_session_id and released_at is null;
  update table_sessions set status = 'void', closed_at = now() where id = p_session_id;

  select name into v_name from employees where id = p_employee_id;
  insert into activity_logs (actor_id, actor_name, action, detail)
  values (p_employee_id, coalesce(v_name, '—'), 'Voided table session',
          format('Session #%s (Table %s) voided without payment', p_session_id, coalesce(v_labels,'—')));
end $$;
