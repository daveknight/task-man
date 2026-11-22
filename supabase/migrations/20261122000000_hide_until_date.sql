-- Hide until is Waiting's own date. Waiting counts as in progress, so only Open tasks have a
-- start date, and only Waiting tasks have a hide-until date.
alter table public.tasks add column hide_until date;

alter table public.tasks drop constraint tasks_start_on_or_before_due;

-- A Waiting task's start date was its hide-until date.
update public.tasks
set hide_until = start_date, start_date = null
where status = 'waiting' and start_date is not null;

-- In Progress tasks lose their start date and keep their status. One with a future start date sat
-- in Upcoming and now shows in In Progress.
update public.tasks
set start_date = null
where status = 'in_progress' and start_date is not null;

alter table public.tasks add constraint tasks_start_on_or_before_due
  check (start_date <= due_date);
alter table public.tasks add constraint tasks_start_only_when_open
  check (start_date is null or status = 'open');
alter table public.tasks add constraint tasks_hide_until_only_when_waiting
  check (hide_until is null or status = 'waiting');
