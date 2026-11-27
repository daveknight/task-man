-- Short-lived MCP authorization codes. The browser login stores a Supabase session
-- here, and the token endpoint reads it once. The table is not readable through the
-- API: only the two functions below touch it, and row-level security has no policy.
-- allow-data-change: deletes only expired or just-used rows from private.mcp_oauth_codes, never task rows

create extension if not exists pgcrypto with schema extensions;

create table private.mcp_oauth_codes (
  code text primary key,
  user_id uuid not null,
  code_challenge text not null,
  redirect_uri text not null,
  client_id text not null,
  resource text,
  scope text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz not null,
  expires_at timestamptz not null
);

alter table private.mcp_oauth_codes enable row level security;

revoke all on private.mcp_oauth_codes from public, anon, authenticated;

-- The signed-in user just proved the password. The code is random; the caller does not choose it.
create function public.mcp_oauth_issue(
  p_code_challenge text,
  p_redirect_uri text,
  p_client_id text,
  p_resource text,
  p_scope text,
  p_access_token text,
  p_refresh_token text,
  p_token_expires_at timestamptz,
  p_ttl_seconds integer
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_code text;
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'sign in required';
  end if;
  if p_code_challenge is null or p_code_challenge !~ '^[A-Za-z0-9_-]{43,128}$' then
    raise exception 'invalid challenge';
  end if;
  if p_redirect_uri is null or length(p_redirect_uri) > 2048 or p_client_id is null or length(p_client_id) > 2048 then
    raise exception 'invalid request';
  end if;
  if p_access_token is null or length(p_access_token) < 20 or length(p_access_token) > 8192
     or coalesce(length(p_refresh_token), 0) > 8192 or p_token_expires_at is null then
    raise exception 'invalid token';
  end if;
  new_code := encode(extensions.gen_random_bytes(32), 'hex');
  delete from private.mcp_oauth_codes where expires_at <= now();
  insert into private.mcp_oauth_codes (
    code, user_id, code_challenge, redirect_uri, client_id, resource, scope,
    access_token, refresh_token, token_expires_at, expires_at
  ) values (
    new_code, actor, p_code_challenge, p_redirect_uri, p_client_id, p_resource, p_scope,
    p_access_token, p_refresh_token, p_token_expires_at,
    case
      when coalesce(p_ttl_seconds, 300) <= 0 then now() - interval '1 second'
      else now() + make_interval(secs => least(p_ttl_seconds, 600))
    end
  );
  return new_code;
end;
$$;

-- Called with the anon key. The code plus the PKCE verifier are the secret: a stolen
-- code is not enough, and the row is deleted on the first attempt either way.
create function public.mcp_oauth_consume(
  p_code text,
  p_code_verifier text,
  p_redirect_uri text,
  p_client_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_row private.mcp_oauth_codes%rowtype;
  expected text;
begin
  delete from private.mcp_oauth_codes as stored
  where stored.code = p_code
  returning * into stored_row;
  if not found then
    return null;
  end if;
  if stored_row.expires_at <= now() then
    return null;
  end if;
  expected := rtrim(translate(encode(extensions.digest(convert_to(coalesce(p_code_verifier, ''), 'utf8'), 'sha256'), 'base64'), '+/', '-_'), '=');
  if expected is distinct from stored_row.code_challenge
     or p_redirect_uri is distinct from stored_row.redirect_uri
     or p_client_id is distinct from stored_row.client_id then
    return null;
  end if;
  return jsonb_build_object(
    'access_token', stored_row.access_token,
    'refresh_token', stored_row.refresh_token,
    'expires_in', greatest(0, ceil(extract(epoch from (stored_row.token_expires_at - now())))::int),
    'scope', stored_row.scope,
    'resource', stored_row.resource
  );
end;
$$;

revoke all on function public.mcp_oauth_issue(text, text, text, text, text, text, text, timestamptz, integer) from public, anon;
revoke all on function public.mcp_oauth_consume(text, text, text, text) from public;
grant execute on function public.mcp_oauth_issue(text, text, text, text, text, text, text, timestamptz, integer) to authenticated, service_role;
grant execute on function public.mcp_oauth_consume(text, text, text, text) to anon, authenticated, service_role;
