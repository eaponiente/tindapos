-- 00020_item_employee_price.sql
-- Per-item employee price: what a staff member pays for an item (e.g. a
-- softdrink that's ₱20 normally but ₱15 for employees). Nullable — an item
-- with no employee price is sold to staff at the regular price. Employee
-- purchases (the 👤 Employee order type) apply these prices automatically.
-- Additive. Apply after 00019, in the Supabase SQL editor. Safe to re-run.

alter table items add column if not exists employee_price numeric(10,2)
  check (employee_price is null or employee_price >= 0);
