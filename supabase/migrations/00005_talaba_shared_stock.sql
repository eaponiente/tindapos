-- 00005_talaba_shared_stock.sql
-- Every item whose name contains "talaba" shares ONE stock count per branch (a
-- shared oyster pool). Any change to one item's stock — a sale, a stock
-- adjustment, or a refund — is mirrored to all the other talaba items in that
-- branch, so they always show the same number. Apply after 00004. Safe to re-run.
--
-- NOTE: this needs no application changes — the app reads items.stock as usual;
-- the triggers keep those values equal.

-- ─── A new talaba item joins the pool at the current shared count ───────────
create or replace function talaba_join_pool() returns trigger
language plpgsql
as $$
begin
  if new.name ilike '%talaba%' then
    new.stock := coalesce(
      (select stock from items
       where name ilike '%talaba%' and branch_id = new.branch_id
       order by updated_at desc limit 1),
      new.stock
    );
  end if;
  return new;
end;
$$;

drop trigger if exists talaba_join_pool_trg on items;
create trigger talaba_join_pool_trg
  before insert on items
  for each row execute function talaba_join_pool();

-- ─── Any stock change propagates to every other talaba item in the branch ───
create or replace function talaba_sync_stock() returns trigger
language plpgsql
as $$
begin
  if new.name ilike '%talaba%' and new.stock is distinct from old.stock then
    -- The "stock is distinct" guard stops the cascade once all rows are equal.
    update items
      set stock = new.stock, updated_at = now()
    where name ilike '%talaba%'
      and branch_id = new.branch_id
      and id <> new.id
      and stock is distinct from new.stock;
  end if;
  return null;
end;
$$;

drop trigger if exists talaba_sync_stock_trg on items;
create trigger talaba_sync_stock_trg
  after update of stock on items
  for each row execute function talaba_sync_stock();
