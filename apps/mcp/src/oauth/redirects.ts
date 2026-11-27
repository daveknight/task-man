/**
 * Where an authorization code may be sent. Loopback is for Claude Code, mcp-remote, and
 * local tests. The https URLs are the Claude and ChatGPT callbacks. Anything else is refused
 * so this server is not an open redirect.
 */

const METADATA_HOSTS = ['claude.ai', 'claude.com', 'chatgpt.com'];

export interface AcceptedClient {
  clientId: string;
  redirectUri: string;
  /** Shown on the login page. The hostname when the client did not publish a name. */
  clientName: string;
}

export function isLoopback(url: URL): boolean {
  return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1');
}

function parseRedirect(value: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.hash || url.username || url.password) return undefined;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  return url;
}

/** Host and path Claude and ChatGPT register, plus any loopback URL. */
export function staticRedirectAllowed(value: string): boolean {
  const url = parseRedirect(value);
  if (!url) return false;
  if (isLoopback(url)) return true;
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  if ((host === 'claude.ai' || host === 'claude.com') && path === '/api/mcp/auth_callback') return true;
  if (host === 'chatgpt.com' && path === '/connector_platform_oauth_redirect') return true;
  if (host === 'chatgpt.com' && /^\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/.test(path)) return true;
  return false;
}

function metadataClientUrl(clientId: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return undefined;
  const host = url.hostname.toLowerCase();
  const allowed = METADATA_HOSTS.some((name) => host === name || host.endsWith(`.${name}`));
  return allowed ? url : undefined;
}

/** Loopback ignores the port, and localhost and 127.0.0.1 both count. https must match exactly. */
function matchesRegistered(requested: URL, registered: string): boolean {
  const listed = parseRedirect(registered);
  if (!listed) return false;
  if (isLoopback(requested) && isLoopback(listed)) {
    return requested.pathname === listed.pathname && requested.search === listed.search;
  }
  return requested.origin === listed.origin && requested.pathname === listed.pathname && requested.search === listed.search;
}

async function clientMetadata(url: URL): Promise<{ redirectUris: string[]; clientName?: string } | undefined> {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return undefined;
  const text = await response.text();
  if (text.length > 65_536) return undefined;
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  if (record.client_id !== undefined && record.client_id !== url.href) return undefined;
  if (!Array.isArray(record.redirect_uris)) return undefined;
  const redirectUris = record.redirect_uris.filter((item): item is string => typeof item === 'string');
  const clientName = typeof record.client_name === 'string' && record.client_name.trim() ? record.client_name.trim() : undefined;
  return { redirectUris, ...(clientName ? { clientName } : {}) };
}

/**
 * A URL client id is a Client ID Metadata Document on a Claude or ChatGPT host.
 * Any other client id is a public client from dynamic registration, and its redirect
 * has to be on the fixed allowlist. Registration is not stored: the check runs again
 * at authorization time.
 */
export async function acceptClient(clientId: string, redirectUri: string): Promise<AcceptedClient | undefined> {
  if (!clientId || clientId.length > 2048) return undefined;
  const requested = parseRedirect(redirectUri);
  if (!requested) return undefined;
  const metadataUrl = metadataClientUrl(clientId);
  if (!metadataUrl) {
    if (!staticRedirectAllowed(redirectUri)) return undefined;
    return { clientId, redirectUri, clientName: requested.hostname };
  }
  let metadata: { redirectUris: string[]; clientName?: string } | undefined;
  try {
    metadata = await clientMetadata(metadataUrl);
  } catch {
    return undefined;
  }
  if (!metadata || !metadata.redirectUris.some((listed) => matchesRegistered(requested, listed))) return undefined;
  return { clientId, redirectUri, clientName: metadata.clientName ?? requested.hostname };
}
