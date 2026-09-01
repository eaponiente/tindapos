-- 00015_reservations.sql
-- Table reservations: a dine-in table can be opened as a reservation with a
-- customer name and an arrival time. It holds the table (shows "Reserved" on
-- the floor) and is NOT auto-released when empty. Adds reserved_at to sessions
-- and surfaces reservation info on the floor view. Apply after 00014. Safe to
-- re-run.

alter table table_sessions add column if not exists reserved_at timestamptz;

-- Rebuild the floor view to expose service type, customer name, and the
-- reservation time so the floor cards can show "Reserved 6:30 PM — Juan".
drop view if exists table_floor;
create view table_floor as
select
  rt.id            as table_id,
  rt.branch_id,
  rt.table_number,
  rt.capacity,
  rt.grid_x,
  rt.grid_y,
  ts.id            as session_id,
  ts.status        as session_status,
  ts.service_type,
  ts.customer_count,
  ts.customer_name,
  ts.reserved_at,
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
