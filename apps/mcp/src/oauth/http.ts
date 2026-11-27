import { createClient } from '@supabase/supabase-js';
import { supabasePublicConfig } from '../config.ts';
import { misconfigured } from '../auth.ts';
import { publicOrigin, resourceAllowed } from './metadata.ts';
import { loginResponse, type LoginFields } from './page.ts';
import { acceptClient, staticRedirectAllowed } from './redirects.ts';
import { consumeCode, issueCode } from './store.ts';

const CHALLENGE = /^[A-Za-z0-9_-]{43,128}$/;

interface AuthorizeInput {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  resource?: string;
  scope?: string;
}

function oauthJson(status: number, error: string, description: string): Response {
  return Response.json(
    { error, error_description: description },
    { status, headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } },
  );
}

function plain(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function readParam(params: URLSearchParams, name: string, max: number): string | undefined {
  const value = params.get(name)?.trim();
  if (!value || value.length > max) return undefined;
  return value;
}

function sameResource(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    const path = (url: URL) => url.pathname.replace(/\/$/, '') || '/';
    return a.origin === b.origin && path(a) === path(b);
  } catch {
    return false;
  }
}

function errorRedirect(redirectUri: string, issuer: string, error: string, description: string, state?: string): Response {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  url.searchParams.set('iss', issuer);
  return new Response(null, {
    status: 302,
    headers: { location: url.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });
}

function grantedScope(requested: string | undefined): string {
  const asked = new Set((requested ?? '').split(/\s+/).filter(Boolean));
  return asked.has('offline_access') ? 'tasks offline_access' : 'tasks';
}

function signInMessage(error: { message: string; status?: number; code?: string }): string {
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message)) return 'Wrong email or password.';
  if (error.status === 429 || error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit') {
    return 'Too many tries. Wait a minute and try again.';
  }
  if (/failed to fetch|network|fetch failed/i.test(error.message)) return "Can't reach the server. Check your connection.";
  // Sign-up is never called. An unknown account comes back as invalid credentials, same as a wrong password.
  return "Couldn't sign in. Try again.";
}

async function formParams(request: Request): Promise<URLSearchParams | Response> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.includes('application/x-www-form-urlencoded')) return oauthJson(400, 'invalid_request', 'Send the form as application/x-www-form-urlencoded.');
  const text = await request.text();
  if (text.length > 16_384) return oauthJson(400, 'invalid_request', 'That form is too large.');
  return new URLSearchParams(text);
}

/**
 * Validates the authorization request. A bad redirect is a page, never a redirect.
 * A good redirect with a bad challenge goes back to the client with an OAuth error.
 */
async function prepare(request: Request, params: URLSearchParams): Promise<
  | { ok: true; input: AuthorizeInput; fields: LoginFields; issuer: string }
  | { ok: false; response: Response }
> {
  const issuer = publicOrigin(request).origin;
  const clientId = readParam(params, 'client_id', 2048);
  const redirectUri = params.get('redirect_uri')?.trim() ?? '';
  if (!clientId || !redirectUri || redirectUri.length > 2048) {
    return { ok: false, response: plain(400, 'The sign-in link is missing a client or a redirect.') };
  }
  const client = await acceptClient(clientId, redirectUri);
  if (!client) return { ok: false, response: plain(400, 'That redirect URL is not allowed.') };
  const state = params.get('state') ?? undefined;
  if (state && state.length > 512) {
    return { ok: false, response: errorRedirect(client.redirectUri, issuer, 'invalid_request', 'state is too long.') };
  }
  const codeChallenge = params.get('code_challenge')?.trim() ?? '';
  const method = params.get('code_challenge_method');
  const responseType = params.get('response_type') ?? 'code';
  if (responseType !== 'code' || method !== 'S256' || !CHALLENGE.test(codeChallenge)) {
    return { ok: false, response: errorRedirect(client.redirectUri, issuer, 'invalid_request', 'PKCE S256 and response_type=code are required.', state) };
  }
  const resource = params.get('resource')?.trim();
  const scope = params.get('scope')?.trim();
  if (resource && !resourceAllowed(request, resource)) {
    return { ok: false, response: errorRedirect(client.redirectUri, issuer, 'invalid_target', 'That resource is not this server.', state) };
  }
  const input: AuthorizeInput = {
    clientId: client.clientId,
    redirectUri: client.redirectUri,
    codeChallenge,
    ...(state ? { state } : {}),
    ...(resource ? { resource } : {}),
    ...(scope ? { scope } : {}),
  };
  const fields: LoginFields = {
    clientId: client.clientId,
    redirectUri: client.redirectUri,
    codeChallenge,
    clientName: client.clientName,
    ...(state ? { state } : {}),
    ...(resource ? { resource } : {}),
    ...(scope ? { scope } : {}),
  };
  return { ok: true, input, fields, issuer };
}

/** Authorization endpoint. GET shows the login page. POST checks the password and redirects with a code. */
export async function handleAuthorize(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') return plain(405, 'Method not allowed');
  const params = request.method === 'GET' ? new URL(request.url).searchParams : await formParams(request);
  if (params instanceof Response) return params;
  const prepared = await prepare(request, params);
  if (!prepared.ok) return prepared.response;
  if (request.method === 'GET') return loginResponse({ fields: prepared.fields, email: '' });

  const email = params.get('email')?.trim() ?? '';
  const password = params.get('password') ?? '';
  if (!email || !password) {
    return loginResponse({ fields: prepared.fields, email, error: 'Wrong email or password.', status: 401 });
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
  const signed = await auth.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) {
    const message = signed.error ? signInMessage(signed.error) : 'Wrong email or password.';
    const status = signed.error?.status === 429 ? 429 : 401;
    return loginResponse({ fields: prepared.fields, email, error: message, status });
  }
  const session = signed.data.session;
  const expiresAt = new Date((session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in) * 1000).toISOString();
  let code: string;
  try {
    code = await issueCode({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      tokenExpiresAt: expiresAt,
      codeChallenge: prepared.input.codeChallenge,
      redirectUri: prepared.fields.redirectUri,
      clientId: prepared.fields.clientId,
      resource: prepared.input.resource,
      scope: grantedScope(prepared.input.scope),
    });
  } catch {
    return loginResponse({ fields: prepared.fields, email, error: "Couldn't sign in. Try again.", status: 500 });
  }
  const back = new URL(prepared.fields.redirectUri);
  back.searchParams.set('code', code);
  if (prepared.input.state) back.searchParams.set('state', prepared.input.state);
  back.searchParams.set('iss', prepared.issuer);
  return new Response(null, {
    status: 303,
    headers: { location: back.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });
}

function tokenResponse(session: { accessToken: string; refreshToken?: string; expiresIn: number; scope?: string }): Response {
  return Response.json(
    {
      access_token: session.accessToken,
      token_type: 'Bearer',
      expires_in: session.expiresIn,
      ...(session.refreshToken ? { refresh_token: session.refreshToken } : {}),
      ...(session.scope ? { scope: session.scope } : {}),
    },
    { status: 200, headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } },
  );
}

async function refreshGrant(refreshToken: string): Promise<Response> {
  let url: string;
  let anonKey: string;
  try {
    ({ url, anonKey } = supabasePublicConfig());
  } catch (error) {
    return misconfigured(error instanceof Error ? error.message : String(error));
  }
  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    return oauthJson(400, 'invalid_grant', 'That refresh token was rejected.');
  }
  if (!response.ok) return oauthJson(400, 'invalid_grant', 'That refresh token was rejected.');
  const body = (await response.json()) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== 'string') return oauthJson(400, 'invalid_grant', 'That refresh token was rejected.');
  return tokenResponse({
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
    expiresIn: typeof body.expires_in === 'number' ? body.expires_in : 0,
  });
}

/** Token endpoint. Returns the Supabase access token and refresh token. The code is single-use. */
export async function handleToken(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' },
    });
  }
  if (request.method !== 'POST') return oauthJson(405, 'invalid_request', 'POST the token request.');
  if (request.headers.get('authorization')?.startsWith('Basic ')) {
    return oauthJson(401, 'invalid_client', 'This server only accepts public clients.');
  }
  const params = await formParams(request);
  if (params instanceof Response) return params;
  const grant = params.get('grant_type');
  if (grant === 'refresh_token') {
    const refreshToken = params.get('refresh_token') ?? '';
    if (!refreshToken) return oauthJson(400, 'invalid_request', 'refresh_token is required.');
    return refreshGrant(refreshToken);
  }
  if (grant !== 'authorization_code') return oauthJson(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token.');
  const code = params.get('code') ?? '';
  const verifier = params.get('code_verifier') ?? '';
  const redirectUri = params.get('redirect_uri')?.trim() ?? '';
  const clientId = params.get('client_id')?.trim() ?? '';
  const resource = params.get('resource')?.trim();
  if (!code || !redirectUri || !clientId) return oauthJson(400, 'invalid_request', 'code, redirect_uri, and client_id are required.');
  if (resource && !resourceAllowed(request, resource)) return oauthJson(400, 'invalid_target', 'That resource is not this server.');
  const session = await consumeCode({ code, verifier, redirectUri, clientId });
  if (!session) return oauthJson(400, 'invalid_grant', 'That authorization code was rejected.');
  if (resource && session.resource && !sameResource(resource, session.resource)) {
    return oauthJson(400, 'invalid_target', 'That resource is not the one this code was issued for.');
  }
  return tokenResponse(session);
}

/** Dynamic client registration. The client id is not stored; the redirect is checked again at sign-in. */
export async function handleRegister(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' },
    });
  }
  if (request.method !== 'POST') return oauthJson(405, 'invalid_request', 'POST the registration.');
  const type = request.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return oauthJson(400, 'invalid_client_metadata', 'Registration is JSON.');
  let body: unknown;
  try {
    body = (await request.json()) as unknown;
  } catch {
    return oauthJson(400, 'invalid_client_metadata', 'Registration is JSON.');
  }
  if (!body || typeof body !== 'object' || !Array.isArray((body as { redirect_uris?: unknown }).redirect_uris)) {
    return oauthJson(400, 'invalid_client_metadata', 'redirect_uris is required.');
  }
  const redirectUris = (body as { redirect_uris: unknown[] }).redirect_uris.filter((item): item is string => typeof item === 'string');
  if (redirectUris.length === 0 || redirectUris.some((uri) => !staticRedirectAllowed(uri))) {
    return oauthJson(400, 'invalid_redirect_uri', 'That redirect URL is not allowed.');
  }
  const clientName = (body as { client_name?: unknown }).client_name;
  return Response.json(
    {
      client_id: crypto.randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      ...(typeof clientName === 'string' ? { client_name: clientName } : {}),
    },
    { status: 201, headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } },
  );
}
