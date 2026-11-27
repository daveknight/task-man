import { createClient } from '@supabase/supabase-js';
import { supabasePublicConfig } from '../config.ts';

/** Five minutes. Tests set this to zero to prove an expired code is rejected. */
let codeTtlSeconds = 300;

export function setOauthCodeTtlSeconds(seconds: number): void {
  codeTtlSeconds = seconds;
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string | undefined;
  expiresIn: number;
  scope: string | undefined;
  resource: string | undefined;
}

function anonClient() {
  const { url, anonKey } = supabasePublicConfig();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function userClient(accessToken: string) {
  const { url, anonKey } = supabasePublicConfig();
  return createClient(url, anonKey, {
    accessToken: async () => accessToken,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Stores the Supabase session behind a one-time code. The user's access token is the
 * credential for the insert, so this never uses a service-role key.
 */
export async function issueCode(input: {
  accessToken: string;
  refreshToken: string | undefined;
  tokenExpiresAt: string;
  codeChallenge: string;
  redirectUri: string;
  clientId: string;
  resource: string | undefined;
  scope: string | undefined;
}): Promise<string> {
  const { data, error } = await userClient(input.accessToken).rpc('mcp_oauth_issue', {
    p_code_challenge: input.codeChallenge,
    p_redirect_uri: input.redirectUri,
    p_client_id: input.clientId,
    p_resource: input.resource ?? null,
    p_scope: input.scope ?? null,
    p_access_token: input.accessToken,
    p_refresh_token: input.refreshToken ?? null,
    p_token_expires_at: input.tokenExpiresAt,
    p_ttl_seconds: codeTtlSeconds,
  });
  if (error || typeof data !== 'string' || data.length === 0) {
    throw new Error('Could not store the sign-in code.');
  }
  return data;
}

/** Exchanges a code. A missing, expired, or mismatched code returns undefined and is not reusable. */
export async function consumeCode(input: {
  code: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
}): Promise<StoredSession | undefined> {
  const { data, error } = await anonClient().rpc('mcp_oauth_consume', {
    p_code: input.code,
    p_code_verifier: input.verifier,
    p_redirect_uri: input.redirectUri,
    p_client_id: input.clientId,
  });
  if (error || !data || typeof data !== 'object') return undefined;
  const row = data as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown; resource?: unknown };
  if (typeof row.access_token !== 'string' || row.access_token.length === 0) return undefined;
  return {
    accessToken: row.access_token,
    refreshToken: typeof row.refresh_token === 'string' && row.refresh_token.length > 0 ? row.refresh_token : undefined,
    expiresIn: typeof row.expires_in === 'number' ? row.expires_in : 0,
    scope: typeof row.scope === 'string' && row.scope.length > 0 ? row.scope : undefined,
    resource: typeof row.resource === 'string' && row.resource.length > 0 ? row.resource : undefined,
  };
}
