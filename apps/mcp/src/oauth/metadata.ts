import { APP_NAME } from '@app/core';
import {
  getOAuthProtectedResourceMetadataUrl,
  oauthMetadataResponse,
  type AuthMetadataOptions,
  type OAuthMetadata,
} from '@modelcontextprotocol/server';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

function strip(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * The origin clients will put in the address bar. The Node adapter always records `http`,
 * so a hosted request uses the proxy's https scheme. Loopback stays http, including when
 * a client sends a forwarded-proto header at the local listener.
 */
export function publicOrigin(request: Request): URL {
  const url = new URL(request.url);
  const forwarded = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const loopback = LOOPBACK.has(url.hostname);
  const protocol = loopback ? url.protocol : forwarded === 'http' ? 'http:' : 'https:';
  return new URL(`${protocol}//${url.host}`);
}

function authMetadata(origin: URL, resourcePath: '/mcp' | '/api/mcp'): AuthMetadataOptions {
  const oauthMetadata: OAuthMetadata = {
    issuer: origin.origin,
    authorization_endpoint: new URL('/authorize', origin).href,
    token_endpoint: new URL('/token', origin).href,
    registration_endpoint: new URL('/register', origin).href,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    // offline_access is an authorization-server scope, not a resource permission.
    // Claude asks for it when it is listed here, and the token response includes a refresh token.
    scopes_supported: ['tasks', 'offline_access'],
  };
  return {
    oauthMetadata,
    resourceServerUrl: new URL(resourcePath, origin),
    scopesSupported: ['tasks'],
    resourceName: APP_NAME,
  };
}

/** RFC 9728 URL advertised on a 401, so Claude and ChatGPT can find the authorization server. */
export function resourceMetadataUrl(request: Request): string {
  const origin = publicOrigin(request);
  const path = new URL(request.url).pathname;
  const resourcePath = path === '/api/mcp' || path.startsWith('/api/mcp/') ? '/api/mcp' : '/mcp';
  return getOAuthProtectedResourceMetadataUrl(new URL(resourcePath, origin));
}

/** Our resource identifiers. A client must name one of these; a pasted Supabase token is not checked against them. */
export function resourceAllowed(request: Request, resource: string): boolean {
  let url: URL;
  try {
    url = new URL(resource);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  const origin = publicOrigin(request);
  const path = strip(url.pathname);
  return url.origin === origin.origin && (path === '/mcp' || path === '/api/mcp');
}

function withPath(request: Request, pathname: string): Request {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, { method: request.method, headers: request.headers });
}

/**
 * Protected-resource and authorization-server metadata. Anything else returns undefined
 * so the caller can 404. The unsuffixed protected-resource path is the same document as
 * `/mcp`, which is the address in the docs.
 */
export function discoveryResponse(request: Request): Response | undefined {
  const path = strip(new URL(request.url).pathname);
  const origin = publicOrigin(request);
  if (path === '/.well-known/oauth-authorization-server') {
    return oauthMetadataResponse(request, authMetadata(origin, '/mcp'));
  }
  const resourcePath = path.endsWith('/api/mcp') ? '/api/mcp' : '/mcp';
  const served =
    path === '/.well-known/oauth-protected-resource' ||
    path === '/.well-known/oauth-protected-resource/mcp' ||
    path === '/.well-known/oauth-protected-resource/api/mcp';
  if (!served) return undefined;
  const options = authMetadata(origin, resourcePath);
  const match = `/.well-known/oauth-protected-resource${resourcePath}`;
  return oauthMetadataResponse(path === match ? request : withPath(request, match), options);
}
