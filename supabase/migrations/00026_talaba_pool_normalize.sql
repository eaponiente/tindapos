-- 00026_talaba_pool_normalize.sql
-- Fix-up for 00025: its backfill tagged talaba_type but ran BEFORE the new
-- type-based triggers were created, so it could not sync stock. That left the
-- White and Tawi-Tawi pools inconsistent — the genuinely typed items held the
-- real count, while dishes defaulted to White (or flex-tagged Tawi-Tawi items)
-- kept their old White+Red "flex" number.
--
-- Snap every (branch, type) pool to its LOWEST member — the real typed count;
-- the inflated dishes carried the old flex number, so min() is the true stock
-- and is the safe (never-oversell) choice. The live sync trigger keeps each
-- pool consistent from here on.
--
-- NOTE: Tawi-Tawi was never tracked separately before, so its normalized number
-- is only a consistent placeholder — set the REAL Tawi-Tawi count afterward on
-- any one Tawi-Tawi item (it syncs to the rest). Idempotent.

do $$
declare r record;
begin
  for r in
    select branch_id, talaba_type, min(stock) as m
    from items
    where talaba_type is not null
    group by branch_id, talaba_type
  loop
    update items set stock = r.m, updated_at = now()
    where branch_id = r.branch_id and talaba_type = r.talaba_type
      and stock is distinct from r.m;
  end loop;
end $$;
