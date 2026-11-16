-- Phase 0 schema. Every table carries user_id default auth.uid() with row-level
-- security on, and the sync-safety pieces the native apps will rely on:
-- server-set updated_at, tombstones, completion uniqueness and C-collated sort keys.

create extension if not exists pg_trgm with schema extensions;

-- updated_at comes from the database clock, never from a device.
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Hard-deleted rows leave a tombstone so an offline device can't bring them back.
-- The existence check skips rows removed because their user was deleted.
create function public.write_tombstone() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tombstones (id, entity, user_id)
  select old.id, tg_argv[0], old.user_id
  where exists (select 1 from auth.users u where u.id = old.user_id)
  on conflict (entity, id) do nothing;
  return old;
end;
$$;

-- tasks -----------------------------------------------------------------------

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null check (length(btrim(title)) > 0),
  description  text not null default '',
  status       text not null default 'open' check (status in ('open', 'in_progress', 'waiting')),
  waiting_on   text,
  wait_until   date,
  flagged      boolean not null default false,
  start_date   date,
  due_date     date,
  repeat       jsonb,
  completed_at timestamptz,
  -- Local calendar days on the device that made the change; recurrence and the
  -- 30-day trash purge work on these, not on UTC timestamps.
  completed_on date,
  deleted_at   timestamptz,
  deleted_on   date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  search       tsvector generated always as (
                 to_tsvector('english', title || ' ' || description)
               ) stored,
  constraint tasks_start_on_or_before_due check (start_date <= due_date),
  constraint tasks_completed_pair check ((completed_at is null) = (completed_on is null)),
  constraint tasks_deleted_pair check ((deleted_at is null) = (deleted_on is null)),
  constraint tasks_id_user_unique unique (id, user_id)
);

create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_search_idx on public.tasks using gin (search);
create index tasks_title_trgm_idx on public.tasks using gin (title extensions.gin_trgm_ops);
create index tasks_description_trgm_idx on public.tasks using gin (description extensions.gin_trgm_ops);

-- task_positions: manual order per view, one row per move -----------------------

create table public.task_positions (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  view_id    text not null,
  task_id    uuid not null,
  sort_key   text collate "C" not null check (length(sort_key) > 0),
  updated_at timestamptz not null default now(),
  primary key (view_id, task_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);

create index task_positions_task_idx on public.task_positions (task_id);
create index task_positions_user_view_idx on public.task_positions (user_id, view_id, sort_key);

-- subtasks --------------------------------------------------------------------

create table public.subtasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id    uuid not null,
  title      text not null check (length(btrim(title)) > 0),
  done       boolean not null default false,
  sort_key   text collate "C" not null check (length(sort_key) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);

create index subtasks_task_idx on public.subtasks (task_id, sort_key);

-- tags ------------------------------------------------------------------------

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  color      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_id_user_unique unique (id, user_id)
);

create unique index tags_user_name_unique on public.tags (user_id, lower(name));

create table public.task_tags (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id    uuid not null,
  tag_id     uuid not null,
  created_at timestamptz not null default now(),
  primary key (task_id, tag_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);

create index task_tags_tag_idx on public.task_tags (tag_id);

-- task_completions: history of recurring occurrences -----------------------------

create table public.task_completions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id        uuid not null,
  occurrence_due date not null,
  kind           text not null check (kind in ('done', 'skip')),
  completed_on   date not null,
  completed_at   timestamptz not null default now(),
  snapshot       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- The same occurrence completed offline on two devices advances the task once.
  constraint task_completions_occurrence_unique unique (task_id, occurrence_due),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);

-- tombstones ------------------------------------------------------------------

create table public.tombstones (
  id        uuid not null,
  entity    text not null default 'task' check (entity in ('task', 'subtask', 'tag')),
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purged_at timestamptz not null default now(),
  primary key (entity, id)
);

create index tombstones_user_idx on public.tombstones (user_id, purged_at);

-- triggers --------------------------------------------------------------------

create trigger tasks_set_updated_at before insert or update on public.tasks
  for each row execute function public.set_updated_at();
create trigger task_positions_set_updated_at before insert or update on public.task_positions
  for each row execute function public.set_updated_at();
create trigger subtasks_set_updated_at before insert or update on public.subtasks
  for each row execute function public.set_updated_at();
create trigger tags_set_updated_at before insert or update on public.tags
  for each row execute function public.set_updated_at();
create trigger task_completions_set_updated_at before insert or update on public.task_completions
  for each row execute function public.set_updated_at();

create trigger tasks_tombstone after delete on public.tasks
  for each row execute function public.write_tombstone('task');
create trigger subtasks_tombstone after delete on public.subtasks
  for each row execute function public.write_tombstone('subtask');
create trigger tags_tombstone after delete on public.tags
  for each row execute function public.write_tombstone('tag');

-- row-level security ------------------------------------------------------------

alter table public.tasks            enable row level security;
alter table public.task_positions   enable row level security;
alter table public.subtasks         enable row level security;
alter table public.tags             enable row level security;
alter table public.task_tags        enable row level security;
alter table public.task_completions enable row level security;
alter table public.tombstones       enable row level security;

create policy tasks_own on public.tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy task_positions_own on public.task_positions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy subtasks_own on public.subtasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy tags_own on public.tags for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy task_tags_own on public.task_tags for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy task_completions_own on public.task_completions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Tombstones are append-only for clients; only the server's purge path removes them.
create policy tombstones_select_own on public.tombstones for select to authenticated
  using (user_id = (select auth.uid()));
create policy tombstones_insert_own on public.tombstones for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on function public.write_tombstone() from public, anon, authenticated;
