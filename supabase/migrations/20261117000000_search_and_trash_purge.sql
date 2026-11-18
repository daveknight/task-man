-- Phase 1a: search over title and description, and the 30-day trash purge.

-- Full-text search, plus a substring match (served by the trigram indexes) for partial words.
-- Never includes Trash. Security invoker, so row-level security limits it to the caller's tasks.
-- An empty query matches everything, so `flagged_only` alone lists flagged tasks.
create function public.search_tasks(
  query text,
  include_completed boolean default false,
  flagged_only boolean default false
) returns setof public.tasks
language sql
stable
set search_path = ''
as $$
  with q as (
    select
      btrim(query) as text,
      websearch_to_tsquery('english', query) as ts,
      '%' || replace(replace(replace(btrim(query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  )
  select t.*
  from public.tasks t, q
  where t.deleted_at is null
    and (include_completed or t.completed_at is null)
    and (not flagged_only or t.flagged)
    and (
      q.text = ''
      or t.search @@ q.ts
      or t.title ilike q.pattern
      or t.description ilike q.pattern
    )
  order by
    (t.title ilike q.pattern) desc,
    ts_rank(t.search, q.ts) desc,
    t.created_at desc,
    t.id
  limit 200;
$$;

-- Permanently removes tasks whose deletion day is more than 30 days before `today`
-- (deleted 30 days ago stays; 31 goes) and returns their ids. The tombstone trigger records each one.
-- The daily job purges every user; the CLI's purge-trash passes its user.
create function public.purge_trash(today date default current_date, only_user uuid default null)
returns setof uuid
language sql
set search_path = ''
as $$
  delete from public.tasks
  where deleted_on is not null
    and deleted_on < today - 30
    and (only_user is null or user_id = only_user)
  returning id;
$$;

revoke all on function public.purge_trash(date, uuid) from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('purge-trash', '17 4 * * *', 'select count(*) from public.purge_trash()');
