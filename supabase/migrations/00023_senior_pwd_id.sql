-- Senior Citizen / PWD discount details.
--
-- The BIR requires the ID number and name of the Senior/PWD availing the 20%
-- discount to be recorded with the sale (the "logbook"). We store them on the
-- sale itself so they print on the receipt and stay with the record. Free-text
-- so the cashier can enter the ID exactly as printed; DOB kept as text too to
-- accept whatever format is on the card.
--
-- Idempotent: safe to run more than once.

alter table sales add column if not exists senior_id_no text;
alter table sales add column if not exists senior_name  text;
alter table sales add column if not exists senior_dob   text;
