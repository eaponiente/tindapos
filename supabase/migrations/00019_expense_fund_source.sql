-- 00019_expense_fund_source.sql
-- Record where the money for an expense came from: the shop's sales (the
-- drawer) or an employee's own pocket (a reimbursement the shop owes them).
-- This is separate from HOW it was paid (Cash / GCash). Additive; existing
-- expenses default to 'sales'. Apply after 00018. Safe to re-run.

alter table expenses add column if not exists fund_source text not null default 'sales'
  check (fund_source in ('sales', 'employee'));
