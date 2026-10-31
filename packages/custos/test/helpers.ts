import { vi } from 'vitest';

export const ISSUER = 'https://auth.test';
export const REDIRECT = 'http://localhost:3000/callback';

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Unsigned JWT: the browser SDK only reads claims, it never verifies. */
export function jwt(claims: Record<string, unknown>, ttlSeconds = 3600): string {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: 'RS256' })}.${b64url({ iat: now, exp: now + ttlSeconds, ...claims })}.sig`;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

/** Routes fetch calls by path; records every call for assertions. */
export function fakeServer(routes: Record<string, Handler>) {
  const calls: { path: string; init: RequestInit; body: URLSearchParams | null }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const body = init.body instanceof URLSearchParams ? init.body : null;
    calls.push({ path: url.pathname, init, body });
    const handler = routes[url.pathname];
    if (!handler) return json({ error: 'not_found' }, 404);
    return handler(url, init);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

export function tokenResponse(sub = 'user-1', extra: Record<string, unknown> = {}) {
  return {
    access_token: jwt({ sub, email: `${sub}@test.dev`, firstName: 'Ada', lastName: 'Lovelace', tenantId: 't1' }),
    refresh_token: `refresh-${sub}`,
    token_type: 'Bearer',
    expires_in: 3600,
    ...extra,
  };
}
