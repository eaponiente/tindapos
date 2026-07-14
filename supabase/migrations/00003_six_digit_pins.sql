-- 00003_six_digit_pins.sql — allow 4-to-6 digit PINs (was a fixed 4). Backward
-- compatible: existing 4-digit PINs keep working; new PINs may be up to 6
-- digits. Apply after 00002, in the Supabase SQL editor. Safe to re-run.

alter table employees alter column pin type varchar(6);

alter table employees drop constraint if exists employees_pin_check;
alter table employees add constraint employees_pin_check check (pin ~ '^[0-9]{4,6}$');
