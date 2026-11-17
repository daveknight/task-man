-- The "Waiting on" person field was dropped from the product; the check-back date is enough.
alter table public.tasks drop column waiting_on;
