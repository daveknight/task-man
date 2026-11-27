-- Field change history. Triggers write one row per changed field, so the web app, the CLI
-- and a later client all leave the same trail. Clients can read their rows and cannot change them.
-- Done and skip stay in task_completions; an occurrence's own follow-up write is not copied here.
-- A reorder that stays in the same section is a task_positions change and is not a trigger here.
-- updated_at and the generated search vector are not fields.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

-- Set just before the task and subtask writes that apply a completion, skip or undo, so those
-- mechanical edits are not a second copy of the occurrence. One outstanding note per task.
create table private.activity_suppress (
  user_id uuid not null,
  task_id uuid not null,
  expires_at timestamptz not null,
  primary key (user_id, task_id)
);

create function private.actor_id(p_user uuid) returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is not null and p_user is not null and p_user is distinct from current_user_id then
    raise exception 'cannot change another user''s history';
  end if;
  if coalesce(current_user_id, p_user) is null then
    raise exception 'occurrence follow-up needs a user';
  end if;
  return coalesce(current_user_id, p_user);
end;
$$;

-- True once, and only while the note is still fresh. An expired note is dropped and does not suppress.
create function private.consume_activity_suppress(p_user uuid, p_task uuid) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  fresh boolean;
begin
  with gone as (
    delete from private.activity_suppress
    where user_id = p_user and task_id = p_task
    returning expires_at
  )
  select coalesce(bool_or(expires_at > now()), false) into fresh from gone;
  return coalesce(fresh, false);
end;
$$;

create table public.task_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null,
  batch_id uuid not null,
  -- Order of fields inside one save. Random ids would not keep that order.
  seq smallint not null default 0,
  at timestamptz not null default now(),
  kind text not null check (kind in ('created', 'changed')),
  field text not null check (field in (
    'title', 'description', 'status', 'flagged', 'startDate', 'hideUntil', 'dueDate',
    'repeat', 'completed', 'deleted', 'subtask', 'tag', 'file'
  )),
  before jsonb,
  after jsonb,
  check (kind = 'changed' or field = 'title'),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);

create index task_activities_task_idx on public.task_activities (user_id, task_id, at);

-- One created row per task that already exists. Older edits stay absent. at is the task's created_at.
insert into public.task_activities (user_id, task_id, batch_id, seq, at, kind, field, before, after)
select user_id, id, gen_random_uuid(), 0, created_at, 'created', 'title', null, to_jsonb(title)
from public.tasks;

create function private.add_activity(
  p_user uuid,
  p_task uuid,
  p_batch uuid,
  p_seq int,
  p_kind text,
  p_field text,
  p_before jsonb,
  p_after jsonb,
  p_at timestamptz
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.task_activities (user_id, task_id, batch_id, seq, at, kind, field, before, after)
  values (p_user, p_task, p_batch, p_seq, p_at, p_kind, p_field, p_before, p_after);
$$;

-- The fields sectionFor needs, plus the completed and deleted days, so a later read can name the
-- section (Ready, Upcoming, In Progress, Waiting, Completed, Recently deleted) as it was that day.
create function private.section_context(
  p_status text,
  p_start date,
  p_completed_at timestamptz,
  p_completed_on date,
  p_deleted_at timestamptz,
  p_deleted_on date
) returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'status', p_status,
    'startDate', p_start,
    'completedAt', p_completed_at,
    'completedOn', p_completed_on,
    'deletedAt', p_deleted_at,
    'deletedOn', p_deleted_on
  );
$$;

create function private.record_task_activity() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch uuid := extensions.gen_random_uuid();
  seq int := 0;
  at_time timestamptz := now();
begin
  if tg_op = 'INSERT' then
    perform private.add_activity(new.user_id, new.id, batch, 0, 'created', 'title', null, to_jsonb(new.title), coalesce(new.created_at, now()));
    return new;
  end if;

  if private.consume_activity_suppress(new.user_id, new.id) then
    return new;
  end if;

  if new.title is distinct from old.title then
    seq := seq + 1;
    perform private.add_activity(new.user_id, new.id, batch, seq, 'changed', 'title', to_jsonb(old.title), to_jsonb(new.title), at_time);
  end if;
  if new.description is distinct from old.description then
    seq := seq + 1;
    perform private.add_activity(new.user_id, new.id, batch, seq, 'changed', 'description', to_jsonb(old.description), to_jsonb(new.description), at_time);
  end if;
  if new.flagged is distinct from old.flagged then
    seq := seq + 1;
    perform private.add_activity(new.user_id, new.id, batch, seq, 'changed', 'flagged', to_jsonb(old.flagged), to_jsonb(new.flagged), at_time);
  end if;
  if new.start_date is distinct from old.start_date then
    seq := seq + 1;
    perform private.add_activity(new.user_id, new.id, batch, seq, 'changed', 'startDate', to_jsonb(old.start_date), to_jsonb(new.start_date), at_time);
  end if;
  if new.hide_until is distinct from old.hide_until then
    seq := seq + 1;
    perform private.add_activity(new.user_id, new.id, batch, seq, 'changed', 'hideUntil', to_jsonb(old.hide_until), to_jsonb(new.hide_until), at_time);
  end if;
  if new.due_date is distinct from old.due_date then
    seq := seq + 1;
    perform private.add_activity(new.user_id, new.id, batch, seq, 'changed', 'dueDate', to_jsonb(old.due_date), to_jsonb(new.due_date), at_time);
  end if;
  if new.repeat is distinct from old.repeat then
    seq := seq + 1;
    perform private.add_activity(new.user_id, new.id, batch, seq, 'changed', 'repeat', old.repeat, new.repeat, at_time);
  end if;
  if new.status is distinct from old.status then
    seq := seq + 1;
    perform private.add_activity(
      new.user_id, new.id, batch, seq, 'changed', 'status',
      private.section_context(old.status, old.start_date, old.completed_at, old.completed_on, old.deleted_at, old.deleted_on),
      private.section_context(new.status, new.start_date, new.completed_at, new.completed_on, new.deleted_at, new.deleted_on),
      at_time
    );
  end if;
  if new.completed_at is distinct from old.completed_at or new.completed_on is distinct from old.completed_on then
    seq := seq + 1;
    perform private.add_activity(
      new.user_id, new.id, batch, seq, 'changed', 'completed',
      private.section_context(old.status, old.start_date, old.completed_at, old.completed_on, old.deleted_at, old.deleted_on),
      private.section_context(new.status, new.start_date, new.completed_at, new.completed_on, new.deleted_at, new.deleted_on),
      at_time
    );
  end if;
  if new.deleted_at is distinct from old.deleted_at or new.deleted_on is distinct from old.deleted_on then
    seq := seq + 1;
    perform private.add_activity(
      new.user_id, new.id, batch, seq, 'changed', 'deleted',
      private.section_context(old.status, old.start_date, old.completed_at, old.completed_on, old.deleted_at, old.deleted_on),
      private.section_context(new.status, new.start_date, new.completed_at, new.completed_on, new.deleted_at, new.deleted_on),
      at_time
    );
  end if;
  return new;
end;
$$;

create function private.record_subtask_activity() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_task uuid;
  batch uuid := extensions.gen_random_uuid();
  seq int := 0;
  at_time timestamptz := now();
begin
  if tg_op = 'DELETE' then
    v_user := old.user_id;
    v_task := old.task_id;
  else
    v_user := new.user_id;
    v_task := new.task_id;
  end if;

  if private.consume_activity_suppress(v_user, v_task) then
    return coalesce(new, old);
  end if;

  -- A task delete cascades to its subtasks. The task is already gone, and its activities go with it.
  if not exists (select 1 from public.tasks t where t.id = v_task and t.user_id = v_user) then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    perform private.add_activity(v_user, v_task, batch, 1, 'changed', 'subtask', null,
      jsonb_build_object('id', new.id, 'title', new.title, 'done', new.done), at_time);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform private.add_activity(v_user, v_task, batch, 1, 'changed', 'subtask',
      jsonb_build_object('id', old.id, 'title', old.title, 'done', old.done), null, at_time);
    return old;
  end if;

  -- sort_key alone is a reorder, same as a task that stays in its section.
  if new.title is distinct from old.title then
    seq := seq + 1;
    perform private.add_activity(v_user, v_task, batch, seq, 'changed', 'subtask',
      jsonb_build_object('id', old.id, 'title', old.title, 'done', old.done),
      jsonb_build_object('id', new.id, 'title', new.title, 'done', old.done),
      at_time);
  end if;
  if new.done is distinct from old.done then
    seq := seq + 1;
    perform private.add_activity(v_user, v_task, batch, seq, 'changed', 'subtask',
      jsonb_build_object('id', new.id, 'title', new.title, 'done', old.done),
      jsonb_build_object('id', new.id, 'title', new.title, 'done', new.done),
      at_time);
  end if;
  return new;
end;
$$;

create function private.record_tag_activity() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_task uuid;
  v_tag uuid;
  v_name text;
begin
  if tg_op = 'DELETE' then
    v_user := old.user_id;
    v_task := old.task_id;
    v_tag := old.tag_id;
  else
    v_user := new.user_id;
    v_task := new.task_id;
    v_tag := new.tag_id;
  end if;

  if not exists (select 1 from public.tasks t where t.id = v_task and t.user_id = v_user) then
    return coalesce(new, old);
  end if;

  select name into v_name from public.tags where id = v_tag and user_id = v_user;

  if tg_op = 'INSERT' then
    perform private.add_activity(v_user, v_task, extensions.gen_random_uuid(), 1, 'changed', 'tag', null,
      jsonb_build_object('id', v_tag, 'name', coalesce(v_name, '')), now());
    return new;
  end if;

  perform private.add_activity(v_user, v_task, extensions.gen_random_uuid(), 1, 'changed', 'tag',
    jsonb_build_object('id', v_tag, 'name', coalesce(v_name, '')), null, now());
  return old;
end;
$$;

create function private.record_file_activity() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_task uuid;
begin
  if tg_op = 'DELETE' then
    v_user := old.user_id;
    v_task := old.task_id;
  else
    v_user := new.user_id;
    v_task := new.task_id;
  end if;

  if not exists (select 1 from public.tasks t where t.id = v_task and t.user_id = v_user) then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    perform private.add_activity(v_user, v_task, extensions.gen_random_uuid(), 1, 'changed', 'file', null,
      jsonb_build_object('id', new.id, 'filename', new.filename), now());
    return new;
  end if;

  perform private.add_activity(v_user, v_task, extensions.gen_random_uuid(), 1, 'changed', 'file',
    jsonb_build_object('id', old.id, 'filename', old.filename), null, now());
  return old;
end;
$$;

create trigger tasks_record_activity after insert or update on public.tasks
  for each row execute function private.record_task_activity();
create trigger subtasks_record_activity after insert or update or delete on public.subtasks
  for each row execute function private.record_subtask_activity();
create trigger task_tags_record_activity after insert or delete on public.task_tags
  for each row execute function private.record_tag_activity();
create trigger attachments_record_activity after insert or delete on public.attachments
  for each row execute function private.record_file_activity();

-- The signed-in user, or the service-role CLI passing that user's id.
create function public.note_occurrence_followup(p_task_id uuid, p_user_id uuid default null) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.actor_id(p_user_id);
begin
  insert into private.activity_suppress (user_id, task_id, expires_at)
  values (v_user, p_task_id, now() + interval '30 seconds')
  on conflict (user_id, task_id) do update set expires_at = excluded.expires_at;
end;
$$;

create function public.clear_occurrence_followup(p_task_id uuid, p_user_id uuid default null) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.actor_id(p_user_id);
begin
  delete from private.activity_suppress where user_id = v_user and task_id = p_task_id;
end;
$$;

alter table public.task_activities enable row level security;

create policy task_activities_select_own on public.task_activities for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.note_occurrence_followup(uuid, uuid) from public, anon;
revoke all on function public.clear_occurrence_followup(uuid, uuid) from public, anon;
grant execute on function public.note_occurrence_followup(uuid, uuid) to authenticated, service_role;
grant execute on function public.clear_occurrence_followup(uuid, uuid) to authenticated, service_role;
