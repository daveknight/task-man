import { APP_NAME } from '@app/core';

export interface LoginFields {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  resource?: string;
  scope?: string;
  clientName: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function hidden(name: string, value: string | undefined): string {
  if (value === undefined) return '';
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
}

/** The browser login for this connection. Sign-up is not offered; the web app's login is unchanged. */
export function loginPage(input: { fields: LoginFields; email: string; error?: string }): string {
  const { fields, email, error } = input;
  const host = escapeHtml(fields.clientName);
  const alert = error ? `<p role="alert">${escapeHtml(error)}</p>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>Sign in · ${APP_NAME}</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f2f2f7;
      color: #000;
    }
    main { width: min(100%, 22rem); padding: 1.5rem; box-sizing: border-box; }
    .app { margin: 0; font-size: 0.8125rem; font-weight: 600; color: rgba(60, 60, 67, 0.6); }
    h1 { margin: 0.15rem 0 0; font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; }
    .host { margin: 0.35rem 0 0; font-size: 0.9375rem; color: rgba(60, 60, 67, 0.6); }
    form { margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; }
    label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8125rem; font-weight: 600; }
    input[type="email"], input[type="password"] {
      height: 44px;
      border: 0;
      border-radius: 10px;
      padding: 0 0.8rem;
      font: inherit;
      font-size: 1rem;
      font-weight: 400;
      background: #fff;
      color: inherit;
    }
    input:focus-visible { outline: 2px solid #007aff; outline-offset: 1px; }
    p[role="alert"] { margin: 0; color: #ff3b30; font-size: 0.8125rem; font-weight: 400; }
    button {
      height: 32px;
      border: 0;
      border-radius: 8px;
      background: #007aff;
      color: #fff;
      font: inherit;
      font-size: 0.9375rem;
      font-weight: 600;
    }
    button:focus-visible { outline: 2px solid #007aff; outline-offset: 2px; }
    @media (pointer: coarse) { button { height: 44px; } }
    @media (prefers-color-scheme: dark) {
      body { background: #000; color: #fff; }
      .app, .host { color: rgba(235, 235, 245, 0.6); }
      input[type="email"], input[type="password"] { background: #1c1c1e; }
      p[role="alert"] { color: #ff453a; }
      button { background: #0a84ff; }
    }
  </style>
</head>
<body>
  <main>
    <p class="app">${APP_NAME}</p>
    <h1>Sign in</h1>
    <p class="host">This connects ${host} to your tasks.</p>
    <form method="post" action="/authorize">
      ${hidden('client_id', fields.clientId)}
      ${hidden('redirect_uri', fields.redirectUri)}
      ${hidden('code_challenge', fields.codeChallenge)}
      ${hidden('code_challenge_method', 'S256')}
      ${hidden('state', fields.state)}
      ${hidden('resource', fields.resource)}
      ${hidden('scope', fields.scope)}
      <label>Email
        <input type="email" name="email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required value="${escapeHtml(email)}">
      </label>
      <label>Password
        <input type="password" name="password" autocomplete="current-password" required>
      </label>
      ${alert}
      <button type="submit">Sign in</button>
    </form>
  </main>
</body>
</html>
`;
}

/**
 * Claude's browser does not treat form-action 'self' as this page's origin, so the
 * sign-in POST to /authorize is blocked. Name this server's authorize URL. The host
 * is the request's public origin; it is not a fixed deploy host.
 */
function loginContentSecurityPolicy(origin: string): string {
  const authorize = new URL('/authorize', origin);
  return `default-src 'none'; style-src 'unsafe-inline'; form-action ${authorize.href}; base-uri 'none'`;
}

export function loginResponse(input: { fields: LoginFields; email: string; error?: string; status?: number; origin: string }): Response {
  return new Response(loginPage(input), {
    status: input.status ?? (input.error ? 401 : 200),
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      'content-security-policy': loginContentSecurityPolicy(input.origin),
    },
  });
}
