-- A read-only role for the nightly backup, so the backup job never holds the all-powerful service key.
-- It can read every row (a policy per table, since row-level security stays on) and write nothing:
-- it is granted no write privilege at all, and its sessions default to read-only on top of that.
-- It has no login until the project owner sets a password (see docs/go-live.md), and the migration
-- is safe to run again (roles belong to the whole database cluster, so it may already exist locally).
--
-- Every table with user data must be listed here AND exported by apps/cli/src/backup-db.ts;
-- apps/cli/test-db/backup-roundtrip.test.ts fails when a new table is in neither place.

do $$
begin
  if not exists (select from pg_roles where rolname = 'backup_reader') then
    create role backup_reader nologin connection limit 3;
  end if;
end
$$;

alter role backup_reader set default_transaction_read_only = on;
alter role backup_reader set statement_timeout = '60s';

grant usage on schema public to backup_reader;
grant select on
  public.tasks,
  public.task_positions,
  public.subtasks,
  public.tags,
  public.task_tags,
  public.task_completions,
  public.tombstones
to backup_reader;

create policy backup_reader_select on public.tasks            for select to backup_reader using (true);
create policy backup_reader_select on public.task_positions   for select to backup_reader using (true);
create policy backup_reader_select on public.subtasks         for select to backup_reader using (true);
create policy backup_reader_select on public.tags            for select to backup_reader using (true);
create policy backup_reader_select on public.task_tags        for select to backup_reader using (true);
create policy backup_reader_select on public.task_completions for select to backup_reader using (true);
create policy backup_reader_select on public.tombstones       for select to backup_reader using (true);
