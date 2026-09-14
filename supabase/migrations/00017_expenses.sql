-- 00017_expenses.sql
-- Expenses tracking + a sales-vs-expenses "net income" summary. Additive:
-- nothing existing changes. Expenses are per-branch (like sales). The
-- net_income function returns sales, refunds, and expenses for a date range in
-- one call so the Expenses tab can show profit without heavy client paging.
-- Apply after 00016, in the Supabase SQL editor. Safe to re-run.

create table if not exists expenses (
  id bigint generated always as identity primary key,
  branch_id bigint not null references branches (id) on delete cascade,
  category text not null,          -- salary | market | softdrinks | ice_blocks | other (free text)
  amount numeric(10,2) not null check (amount >= 0),
  note text,
  spent_at date not null default current_date,
  recorded_by bigint references employees (id) on delete set null,
  recorded_by_name text,           -- snapshot, survives employee deletion
  created_at timestamptz not null default now()
);
alter table expenses enable row level security;
create index if not exists expenses_branch_date_idx on expenses (branch_id, spent_at desc);

-- Sales vs expenses for a date range (inclusive). p_branch_id null = all branches.
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
        where (p_branch_id is null or branch_id = p_branch_id)
          and spent_at >= p_from and spent_at <= p_to), 0),
    'by_category', coalesce((select json_object_agg(category, cat_total) from (
        select category, sum(amount) as cat_total from expenses
        where (p_branch_id is null or branch_id = p_branch_id)
          and spent_at >= p_from and spent_at <= p_to
        group by category) c), '{}'::json)
  );
$$;
