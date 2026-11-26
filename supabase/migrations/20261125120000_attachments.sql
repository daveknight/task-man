-- Phase 3: files on a task, kept in a private Storage bucket.
-- The free plan allows 50 MiB per file and 1 GiB altogether (called 50 MB and 1 GB in the app).
-- Those two numbers are also FILE_BYTE_LIMIT and STORAGE_BYTE_LIMIT in packages/core.
--
-- Storage refuses a direct SQL delete (it would leave the bytes behind), so removing a row
-- records the object path in file_deletions. The signed-in client, and the CLI on reset and
-- purge, then delete the objects through the Storage API and clear the queue. The daily
-- purge only queues paths; the next time that person opens the app, the files go too.

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800);

create policy attachments_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy attachments_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy attachments_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- attachments ------------------------------------------------------------------

create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id      uuid not null,
  -- `{user_id}/{task_id}/{id}`, so the storage policies and this row name the same object.
  storage_path text not null,
  filename     text not null check (char_length(btrim(filename)) > 0 and char_length(filename) <= 255),
  mime         text not null check (char_length(mime) between 1 and 127),
  bytes        bigint not null check (bytes > 0 and bytes <= 52428800),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint attachments_path_shape check (
    storage_path = (user_id::text || '/' || task_id::text || '/' || id::text)
  ),
  constraint attachments_path_unique unique (storage_path),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);

create index attachments_task_idx on public.attachments (user_id, task_id, created_at);

-- Paths waiting for the Storage API. One row per object, written when the attachment row goes.
create table public.file_deletions (
  storage_path text primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now()
);

create index file_deletions_user_idx on public.file_deletions (user_id, created_at);

-- A hard-deleted file is recorded the same way as a hard-deleted subtask.
alter table public.tombstones drop constraint tombstones_entity_check;
alter table public.tombstones add constraint tombstones_entity_check
  check (entity in ('task', 'subtask', 'tag', 'attachment'));

-- triggers --------------------------------------------------------------------

create trigger attachments_set_updated_at before insert or update on public.attachments
  for each row execute function public.set_updated_at();

-- The stored object has to exist and be the size the row claims, and the user's files
-- together stay within 1 GiB. Runs as the caller, so row-level security hides other people's rows.
create function public.enforce_attachment_limits() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  object_bytes bigint;
  used bigint;
begin
  select coalesce(nullif(o.metadata->>'size', '')::bigint, nullif(o.metadata->>'contentLength', '')::bigint)
    into object_bytes
  from storage.objects o
  where o.bucket_id = 'attachments'
    and o.name = new.storage_path
    and o.archived_at is null;

  if object_bytes is null then
    raise exception 'Attachment file is missing from storage';
  end if;
  -- 50 MB is enforced by the column check and the bucket limit. This only stops a row
  -- from claiming a smaller size than the object Storage actually stored.
  if object_bytes <> new.bytes then
    raise exception 'Attachment size does not match the stored file';
  end if;

  select coalesce(sum(a.bytes), 0) into used
  from public.attachments a
  where a.user_id = new.user_id
    and a.id <> new.id;

  if used + new.bytes > 1073741824 then
    raise exception 'Storage is full. 1 GB is the limit.';
  end if;
  return new;
end;
$$;

create trigger attachments_enforce_limits before insert or update on public.attachments
  for each row execute function public.enforce_attachment_limits();

-- Queue the object. Skipped when the user themselves is being removed.
create function public.queue_file_deletion() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.file_deletions (storage_path, user_id)
  select old.storage_path, old.user_id
  where exists (select 1 from auth.users u where u.id = old.user_id)
  on conflict (storage_path) do nothing;
  return old;
end;
$$;

create trigger attachments_queue_deletion after delete on public.attachments
  for each row execute function public.queue_file_deletion();

create trigger attachments_tombstone after delete on public.attachments
  for each row execute function public.write_tombstone('attachment');

-- What the signed-in user is storing. Pass the user id; row-level security already
-- hides everyone else's rows, and the filter keeps a service-role caller scoped.
create function public.storage_used(only_user uuid default null)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(bytes), 0)
  from public.attachments
  where only_user is null or user_id = only_user;
$$;

-- row-level security ----------------------------------------------------------

alter table public.attachments enable row level security;
alter table public.file_deletions enable row level security;

create policy attachments_own on public.attachments for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- The queue is written by the trigger. The owner can read it and clear it after the
-- Storage API has deleted the objects. They can't insert a path by hand.
create policy file_deletions_select_own on public.file_deletions for select to authenticated
  using (user_id = (select auth.uid()));
create policy file_deletions_delete_own on public.file_deletions for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on function public.queue_file_deletion() from public, anon, authenticated;
