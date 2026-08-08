-- 00006_talaba_red_white_split.sql
-- Splits the shared Talaba stock into TWO pools per branch:
--   * RED pool   = talaba items whose name contains "red".
--   * WHITE pool = every OTHER talaba item — the "white" ones AND the uncoloured
--                  dishes (Talaba Cheese, Kinilaw, Soup, with Lato), which are
--                  made from White Talaba by default.
-- Items in the same pool keep the same stock count; a sale/adjustment/refund to
-- one mirrors to the rest of its pool. Red and White are independent of each
-- other.
--
-- Redefines the trigger functions from 00005 (the triggers pick up the new
-- logic automatically). Apply after 00005. Safe to re-run.

-- A new talaba item joins its own pool (red vs. not-red) at the current count.
create or replace function talaba_join_pool() returns trigger
language plpgsql
as $$
declare
  v_is_red boolean;
begin
  if new.name ilike '%talaba%' then
    v_is_red := new.name ilike '%red%';
    new.stock := coalesce(
      (select stock from items
       where name ilike '%talaba%'
         and (name ilike '%red%') = v_is_red   -- same pool
         and branch_id = new.branch_id
       order by updated_at desc limit 1),
      new.stock
    );
  end if;
  return new;
end;
$$;

-- A stock change to a talaba item propagates only within its pool (red vs.
-- not-red) in the same branch.
create or replace function talaba_sync_stock() returns trigger
language plpgsql
as $$
declare
  v_is_red boolean;
begin
  if new.name ilike '%talaba%' and new.stock is distinct from old.stock then
    v_is_red := new.name ilike '%red%';
    update items
      set stock = new.stock, updated_at = now()
    where name ilike '%talaba%'
      and (name ilike '%red%') = v_is_red
      and branch_id = new.branch_id
      and id <> new.id
      and stock is distinct from new.stock;
  end if;
  return null;
end;
$$;
