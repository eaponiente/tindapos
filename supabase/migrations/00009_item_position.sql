-- 00009_item_position.sql
-- Lets the owner arrange the Sell-page product tiles in any order. Each item
-- row gets a `position`; the Sell grid (and the Items list) orders by it. The
-- reorder_items RPC rewrites the positions for a branch in one transaction.
-- Apply after 00008. Safe to re-run.

alter table items add column if not exists position integer not null default 0;

-- Seed a stable starting order (alphabetical, per branch) — but ONLY the first
-- time, so re-running this migration never wipes an arrangement the owner made.
do $$
begin
  if not exists (select 1 from items where position <> 0) then
    update items i set position = o.rn
    from (
      select id, (row_number() over (partition by branch_id order by name) - 1) as rn
      from items
    ) o
    where o.id = i.id;
  end if;
end $$;

-- Apply a new order for a branch: p_ids is the item ids in the desired order.
create or replace function reorder_items(p_ids bigint[]) returns void
language plpgsql
as $$
declare
  i int;
begin
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    update items set position = i - 1 where id = p_ids[i];
  end loop;
end;
$$;
