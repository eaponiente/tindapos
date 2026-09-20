-- Super Admin role — a tier above Owner.
--
-- Owners keep full run-the-business access, but only a Super Admin can create,
-- edit, or remove owner-level accounts (and Super Admins). This lets you have
-- other owners who cannot touch your account. All role gating is enforced in the
-- UI/route handlers via roleRank(); this migration only widens the allowed set
-- and promotes the Super Admin.
--
-- Idempotent: safe to run more than once.

-- Widen the role CHECK constraint. Drop whatever check currently references the
-- role column (its auto-generated name can vary) before adding the new one.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'employees'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table employees drop constraint %I', c.conname);
  end loop;
end $$;

alter table employees
  add constraint employees_role_check
  check (role in ('cashier', 'manager', 'owner', 'super_admin'));

-- Promote JOBO (id 4) to Super Admin. Josef and Madam dandan stay as owners.
update employees set role = 'super_admin' where id = 4;
