-- 00003_six_digit_pins.sql — allow 4-to-6 digit PINs (was a fixed 4). Backward
-- compatible: existing 4-digit PINs keep working; new PINs may be up to 6
-- digits. Apply after 00002, in the Supabase SQL editor. Safe to re-run.
--
-- The employee_overview view selects e.* (which includes pin), so Postgres
-- won't let us change the column type while it exists — we drop the view,
-- widen the column, then recreate the view exactly as 00002 defined it.

drop view if exists employee_overview;

alter table employees alter column pin type varchar(6);
alter table employees drop constraint if exists employees_pin_check;
alter table employees add constraint employees_pin_check check (pin ~ '^[0-9]{4,6}$');

create view employee_overview as
select
  e.*,
  b.name as branch_name,
  coalesce((select count(*) from sales s where s.employee_id = e.id and not s.refunded), 0)::int as receipts_count,
  coalesce((select sum(s.total) from sales s where s.employee_id = e.id and not s.refunded), 0)::numeric(12,2) as sales_total,
  (select max(sh.clock_in) from shifts sh where sh.employee_id = e.id) as last_clock_in
from employees e
left join branches b on b.id = e.branch_id;

revoke all on employee_overview from anon, authenticated;
