-- A Waiting task's start date is its check-back date, so wait_until folds into start_date.
-- Only Waiting tasks may have a start date after the due date.
alter table public.tasks drop constraint tasks_start_on_or_before_due;

update public.tasks
set start_date = wait_until
where status = 'waiting' and wait_until is not null;

alter table public.tasks add constraint tasks_start_on_or_before_due
  check (status = 'waiting' or start_date <= due_date);

alter table public.tasks drop column wait_until;
