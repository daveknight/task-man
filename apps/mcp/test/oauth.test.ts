import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listen, type ListeningServer } from '../src/listen.ts';
import { loginPage, loginResponse } from '../src/oauth/page.ts';
import { s256Challenge } from '../src/oauth/pkce.ts';
import { staticRedirectAllowed } from '../src/oauth/redirects.ts';

describe('PKCE and redirects', () => {
  it('matches the RFC 7636 S256 vector', () => {
    expect(s256Challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('allows loopback and the Claude and ChatGPT callbacks, and nothing else', () => {
    expect(staticRedirectAllowed('http://127.0.0.1:3118/callback')).toBe(true);
    expect(staticRedirectAllowed('http://localhost/callback')).toBe(true);
    expect(staticRedirectAllowed('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(staticRedirectAllowed('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true);
    expect(staticRedirectAllowed('https://chatgpt.com/connector/oauth/abc123')).toBe(true);
    expect(staticRedirectAllowed('https://evil.example/callback')).toBe(false);
    expect(staticRedirectAllowed('javascript:alert(1)')).toBe(false);
    expect(staticRedirectAllowed('http://127.0.0.1:3118/callback#fragment')).toBe(false);
  });
});

describe('login page', () => {
  const fields = {
    clientId: 'taskman-test',
    redirectUri: 'http://127.0.0.1/callback',
    codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    clientName: '127.0.0.1',
    state: 's1',
  };

  it('keeps a bad password on the page and does not offer sign-up', () => {
    const html = loginPage({ fields, email: 'dev@example.com', error: 'Wrong email or password.' });
    expect(html).toContain('Wrong email or password.');
    expect(html).toContain('>Sign in<');
    expect(html).not.toMatch(/sign up|create account/i);
    expect(html).not.toContain('type="password" value=');
  });

  it('escapes the email and the client name', () => {
    const html = loginPage({
      fields: { ...fields, clientName: '<script>' },
      email: 'a"b<c',
      error: '<b>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('value="a&quot;b&lt;c"');
    expect(html).toContain('&lt;b&gt;');
  });

  it('allows the sign-in POST to the request origin, with no path', () => {
    const policy = (origin: string) => loginResponse({ fields, email: '', origin }).headers.get('content-security-policy');
    expect(policy('https://mcp.example')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; form-action https://mcp.example; base-uri 'none'",
    );
    expect(policy('http://127.0.0.1:8787')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; form-action http://127.0.0.1:8787; base-uri 'none'",
    );
    expect(policy('https://mcp.example/authorize')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; form-action https://mcp.example; base-uri 'none'",
    );
  });
});

describe('OAuth discovery', () => {
  let server: ListeningServer;

  beforeAll(async () => {
    server = await listen({ host: '127.0.0.1', port: 0 });
  });

  afterAll(async () => {
    await server.close();
  });

  it('publishes authorization-server metadata and the protected-resource document', async () => {
    const origin = new URL(server.url).origin;
    const metadata = await fetch(new URL('/.well-known/oauth-authorization-server', origin));
    expect(metadata.status).toBe(200);
    const body = (await metadata.json()) as {
      issuer: string;
      authorization_endpoint: string;
      token_endpoint: string;
      registration_endpoint: string;
      code_challenge_methods_supported: string[];
      grant_types_supported: string[];
      authorization_response_iss_parameter_supported: boolean;
    };
    expect(body.issuer).toBe(origin);
    expect(body.authorization_endpoint).toBe(`${origin}/authorize`);
    expect(body.token_endpoint).toBe(`${origin}/token`);
    expect(body.registration_endpoint).toBe(`${origin}/register`);
    expect(body.code_challenge_methods_supported).toEqual(['S256']);
    expect(body.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
    expect(body.authorization_response_iss_parameter_supported).toBe(true);

    const resource = await fetch(new URL('/.well-known/oauth-protected-resource/mcp', origin));
    expect(resource.status).toBe(200);
    const doc = (await resource.json()) as { resource: string; authorization_servers: string[] };
    expect(doc.resource).toBe(server.url);
    expect(doc.authorization_servers).toEqual([origin]);
  });

  it('points a missing token at the protected-resource metadata', async () => {
    const response = await fetch(server.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: '{}' });
    expect(response.status).toBe(401);
    const challenge = response.headers.get('www-authenticate') ?? '';
    expect(challenge).toContain(`resource_metadata="${new URL(server.url).origin}/.well-known/oauth-protected-resource/mcp"`);
  });

  it('serves the login page with form-action for this listener', async () => {
    const origin = new URL(server.url).origin;
    const redirect = 'http://127.0.0.1/callback';
    const response = await fetch(
      `${origin}/authorize?response_type=code&client_id=taskman-test&redirect_uri=${encodeURIComponent(redirect)}&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toBe(
      `default-src 'none'; style-src 'unsafe-inline'; form-action ${origin}; base-uri 'none'`,
    );
  });

  it('refuses a redirect off the allowlist and sends a PKCE error back to an allowed one', async () => {
    const origin = new URL(server.url).origin;
    const blocked = await fetch(
      `${origin}/authorize?response_type=code&client_id=taskman-test&redirect_uri=${encodeURIComponent('https://evil.example/callback')}&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256`,
      { redirect: 'manual' },
    );
    expect(blocked.status).toBe(400);
    expect(blocked.headers.get('location')).toBeNull();

    const redirect = 'http://127.0.0.1/callback';
    const missing = await fetch(
      `${origin}/authorize?response_type=code&client_id=taskman-test&redirect_uri=${encodeURIComponent(redirect)}&resource=${encodeURIComponent(server.url)}`,
      { redirect: 'manual' },
    );
    expect(missing.status).toBe(302);
    const location = new URL(missing.headers.get('location') ?? '');
    expect(location.origin).toBe('http://127.0.0.1');
    expect(location.searchParams.get('error')).toBe('invalid_request');
    expect(location.searchParams.get('iss')).toBe(origin);
    expect(location.searchParams.get('code')).toBeNull();
  });

  it('registers a loopback client and rejects an unknown redirect', async () => {
    const origin = new URL(server.url).origin;
    const created = await fetch(new URL('/register', origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['http://127.0.0.1:9/callback'], client_name: 'Test', token_endpoint_auth_method: 'none' }),
    });
    expect(created.status).toBe(201);
    const registered = (await created.json()) as { client_id: string; token_endpoint_auth_method: string };
    expect(registered.client_id).toEqual(expect.any(String));
    expect(registered.token_endpoint_auth_method).toBe('none');

    const rejected = await fetch(new URL('/register', origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['https://evil.example/callback'] }),
    });
    expect(rejected.status).toBe(400);
    const body = (await rejected.json()) as { error: string };
    expect(body.error).toBe('invalid_redirect_uri');
  });
});
