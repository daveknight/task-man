import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthInfo } from '@modelcontextprotocol/server';
import type { Scope } from '@app/data';
import { supabasePublicConfig } from './config.ts';

const TOKEN_REQUIRED = 'A Supabase user access token is required. Send Authorization: Bearer <access_token>.';
const TOKEN_REJECTED = 'That access token was rejected. Sign in again and send the new access token.';
const SERVICE_ROLE_REJECTED = 'This server does not accept a service-role key. Send the user access token.';

export interface OpenedUser {
  auth: AuthInfo;
  scope: Scope;
}

/**
 * 401 before any database call. A missing or unusable token never opens a client that could write.
 * `resource_metadata` is how an MCP client finds the browser login.
 */
export function unauthorized(message: string, options?: { resourceMetadataUrl?: string; invalidToken?: boolean }): Response {
  const params: string[] = [];
  if (options?.invalidToken) params.push('error="invalid_token"');
  if (options?.resourceMetadataUrl) params.push(`resource_metadata="${options.resourceMetadataUrl}"`);
  return Response.json(
    { error: 'unauthorized', message },
    { status: 401, headers: { 'cache-control': 'no-store', 'www-authenticate': params.length ? `Bearer ${params.join(', ')}` : 'Bearer' } },
  );
}

export function misconfigured(message: string): Response {
  return Response.json({ error: 'server_misconfigured', message }, { status: 500, headers: { 'cache-control': 'no-store' } });
}

function bearerToken(header: string | null): string | undefined {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '');
  return match?.[1];
}

/** Unverified peek, used only to refuse a service-role key before it is sent anywhere. */
function jwtClaim(token: string, claim: string): unknown {
  const segment = token.split('.')[1];
  if (!segment) return undefined;
  try {
    const json = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown;
    if (!json || typeof json !== 'object') return undefined;
    return (json as Record<string, unknown>)[claim];
  } catch {
    return undefined;
  }
}

function userClient(url: string, anonKey: string, accessToken: string): SupabaseClient {
  return createClient(url, anonKey, {
    accessToken: async () => accessToken,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Checks the bearer token with Supabase Auth and returns a client that sends it on every
 * request. Row-level security then scopes reads and writes to that user.
 */
export async function openUser(authorization: string | null, resourceMetadataUrl?: string): Promise<OpenedUser | Response> {
  const challenge = resourceMetadataUrl ? { resourceMetadataUrl } : undefined;
  const token = bearerToken(authorization);
  if (!token) return unauthorized(TOKEN_REQUIRED, challenge);
  if (token.startsWith('sb_secret_') || jwtClaim(token, 'role') === 'service_role') {
    return unauthorized(SERVICE_ROLE_REJECTED, { ...challenge, invalidToken: true });
  }

  let url: string;
  let anonKey: string;
  try {
    ({ url, anonKey } = supabasePublicConfig());
  } catch (error) {
    return misconfigured(error instanceof Error ? error.message : String(error));
  }

  const auth = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return unauthorized(TOKEN_REJECTED, { ...challenge, invalidToken: true });

  const exp = jwtClaim(token, 'exp');
  const info: AuthInfo = {
    token,
    clientId: data.user.id,
    scopes: ['authenticated'],
    ...(typeof exp === 'number' ? { expiresAt: exp } : {}),
  };
  return { auth: info, scope: { db: userClient(url, anonKey, token), userId: data.user.id } };
}
