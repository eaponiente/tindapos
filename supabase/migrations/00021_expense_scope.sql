-- 00021_expense_scope.sql
-- Split expenses into "daily" running costs vs "bank" (Bank/GCash) supply /
-- capital purchases — the big, occasional ones that shouldn't inflate the daily
-- expense total or daily net income. Existing expenses default to 'daily'.
-- Additive. Apply after 00020, in the Supabase SQL editor. Safe to re-run.

alter table expenses add column if not exists scope text not null default 'daily'
  check (scope in ('daily', 'bank'));

-- net_income now counts only DAILY expenses toward expenses_total / net income,
-- and reports bank_total (Bank/GCash supply/capital) separately.
create or replace function net_income(p_branch_id bigint, p_from date, p_to date)
returns json language sql security definer as $$
  select json_build_object(
    'sales_total', coalesce((select sum(total) from sales
        where not refunded
          and (p_branch_id is null or branch_id = p_branch_id)
          and created_at >= p_from and created_at < (p_to + 1)), 0),
    'sales_count', (select count(*) from sales
        where not refunded
          and (p_branch_id is null or branch_id = p_branch_id)
          and created_at >= p_from and created_at < (p_to + 1)),
    'refunds_total', coalesce((select sum(total) from sales
        where refunded
          and (p_branch_id is null or branch_id = p_branch_id)
          and created_at >= p_from and created_at < (p_to + 1)), 0),
    'expenses_total', coalesce((select sum(amount) from expenses
        where scope <> 'bank'
          and (p_branch_id is null or branch_id = p_branch_id)
          and spent_at >= p_from and spent_at <= p_to), 0),
    'bank_total', coalesce((select sum(amount) from expenses
        where scope = 'bank'
          and (p_branch_id is null or branch_id = p_branch_id)
          and spent_at >= p_from and spent_at <= p_to), 0),
    'by_category', coalesce((select json_object_agg(category, cat_total) from (
        select category, sum(amount) as cat_total from expenses
        where scope <> 'bank'
          and (p_branch_id is null or branch_id = p_branch_id)
          and spent_at >= p_from and spent_at <= p_to
        group by category) c), '{}'::json)
  );
$$;
