-- Phase 2: search finds tasks by tag name, and filters to tasks that have every selected tag.
--
-- Adding an argument can't be done with `create or replace` (that would create a second overload, and a
-- call with three named arguments would be ambiguous), so the function is dropped and created again in
-- this one transaction. No table data is touched. `tag_ids` defaults to none, so a caller that doesn't
-- know about tags (an older copy of the web app) keeps working with the same three arguments.
drop function public.search_tasks(text, boolean, boolean);

-- Full-text search plus a substring match on title, description and tag names, never including Trash.
-- `tag_ids` is an AND filter: a task must have every listed tag. Security invoker, so row-level
-- security limits everything it reads, task_tags and tags included, to the caller's rows.
-- An empty query with no filters matches everything, so the filters alone can list tasks.
create function public.search_tasks(
  query text,
  include_completed boolean default false,
  flagged_only boolean default false,
  tag_ids uuid[] default '{}'
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
      coalesce(cardinality(tag_ids), 0) = 0
      or not exists (
        select 1
        from unnest(tag_ids) as want (id)
        where not exists (
          select 1 from public.task_tags tt where tt.task_id = t.id and tt.tag_id = want.id
        )
      )
    )
    and (
      q.text = ''
      or t.search @@ q.ts
      or t.title ilike q.pattern
      or t.description ilike q.pattern
      or exists (
        select 1
        from public.task_tags tt
        join public.tags g on g.id = tt.tag_id
        where tt.task_id = t.id and g.name ilike q.pattern
      )
    )
  order by
    (t.title ilike q.pattern) desc,
    ts_rank(t.search, q.ts) desc,
    t.created_at desc,
    t.id
  limit 200;
$$;
