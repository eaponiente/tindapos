-- 00006_talaba_red_white_split.sql
-- Splits the shared Talaba stock into TWO pools per branch: items whose name
-- contains "talaba" + "red" share one count, items with "talaba" + "white"
-- share another. Talaba items with neither colour (e.g. TALABA CHEESE, SOUP,
-- KINILAW) are NOT synced — they keep their own independent stock.
--
-- This redefines the trigger functions installed by 00005; the triggers created
-- there automatically pick up the new logic. Apply after 00005. Safe to re-run.

-- A new coloured talaba item joins its own colour's pool at the current count.
create or replace function talaba_join_pool() returns trigger
language plpgsql
as $$
declare
  v_color text;
begin
  if new.name ilike '%talaba%' then
    if new.name ilike '%red%' then
      v_color := 'red';
    elsif new.name ilike '%white%' then
      v_color := 'white';
    else
      v_color := null; -- uncoloured talaba dish: no shared pool
    end if;

    if v_color is not null then
      new.stock := coalesce(
        (select stock from items
         where name ilike '%talaba%'
           and name ilike ('%' || v_color || '%')
           and branch_id = new.branch_id
         order by updated_at desc limit 1),
        new.stock
      );
    end if;
  end if;
  return new;
end;
$$;

-- A stock change to a coloured talaba item propagates only to items of the
-- same colour in the same branch.
create or replace function talaba_sync_stock() returns trigger
language plpgsql
as $$
declare
  v_color text;
begin
  if new.name ilike '%talaba%' and new.stock is distinct from old.stock then
    if new.name ilike '%red%' then
      v_color := 'red';
    elsif new.name ilike '%white%' then
      v_color := 'white';
    else
      v_color := null;
    end if;

    if v_color is not null then
      update items
        set stock = new.stock, updated_at = now()
      where name ilike '%talaba%'
        and name ilike ('%' || v_color || '%')
        and branch_id = new.branch_id
        and id <> new.id
        and stock is distinct from new.stock;
    end if;
  end if;
  return null;
end;
$$;
