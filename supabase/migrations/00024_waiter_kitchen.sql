-- Waiter & Kitchen roles + Kitchen order tracking. FULLY ADDITIVE.
--
-- Reuses the existing table_sessions / table_session_items model (the same order
-- data the Cashier and Waiter use). Adds a per-item kitchen status so the Kitchen
-- Dashboard can mark each item DONE, and a session-level kitchen_done_at so a
-- table can be marked "kitchen completed" without touching payment or freeing the
-- table — the Cashier's existing Pay Bill still does that.
--
-- Idempotent: safe to run more than once. Apply in the Supabase SQL editor.

-- ─── Per-item kitchen status ────────────────────────────────────────────────
-- pending → (preparing) → done. The dashboard toggles pending/done; 'preparing'
-- is kept available for future use.
alter table table_session_items
  add column if not exists kitchen_status text not null default 'pending';
do $$ begin
  alter table table_session_items
    add constraint tsi_kitchen_status_chk check (kitchen_status in ('pending','preparing','done'));
exception when duplicate_object then null; end $$;
alter table table_session_items
  add column if not exists kitchen_done_at timestamptz;

-- ─── Session-level kitchen completion ───────────────────────────────────────
-- Null = still cooking (shows on the Kitchen board). Set = all food done.
alter table table_sessions
  add column if not exists kitchen_done_at timestamptz;

-- ─── Allow the two new staff roles ──────────────────────────────────────────
-- Drop whatever CHECK currently guards employees.role (its auto name can vary),
-- then re-add it with waiter + kitchen included.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'employees'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table employees drop constraint %I', c.conname);
  end loop;
end $$;
alter table employees
  add constraint employees_role_check
  check (role in ('cashier','manager','owner','super_admin','waiter','kitchen'));

-- ─── Mark a whole session kitchen-completed ─────────────────────────────────
-- Marks any not-yet-done items done, stamps the session, and flags it
-- 'for_payment' so the floor shows it's ready for the Cashier. The table stays
-- occupied until Pay Bill (create_sale) — payment and stock are unchanged.
create or replace function kitchen_complete_session(p_session_id bigint, p_employee_id bigint)
returns void language plpgsql security definer as $$
declare v_status text; v_name text; v_labels text;
begin
  select status into v_status from table_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if v_status not in ('open','for_payment') then raise exception 'This session is not open'; end if;

  update table_session_items
     set kitchen_status = 'done', kitchen_done_at = coalesce(kitchen_done_at, now())
   where session_id = p_session_id and kitchen_status <> 'done';

  update table_sessions
     set kitchen_done_at = now(),
         status = case when status = 'open' then 'for_payment' else status end
   where id = p_session_id;

  select name into v_name from employees where id = p_employee_id;
  select string_agg(rt.table_number::text, ' + ' order by rt.table_number) into v_labels
    from table_session_tables tst join restaurant_tables rt on rt.id = tst.table_id
   where tst.session_id = p_session_id and tst.released_at is null;

  insert into activity_logs (actor_id, actor_name, action, detail)
  values (p_employee_id, coalesce(v_name,'—'), 'Kitchen completed',
          format('Session #%s%s', p_session_id,
                 case when v_labels is not null then ' — Table '||v_labels else '' end));
end $$;
