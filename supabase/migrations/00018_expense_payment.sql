-- 00018_expense_payment.sql
-- Record how each expense was paid — Cash or GCash. Additive; existing
-- expenses default to Cash. Apply after 00017, in the Supabase SQL editor.
-- Safe to re-run.

alter table expenses add column if not exists payment_method text not null default 'cash'
  check (payment_method in ('cash', 'gcash'));
