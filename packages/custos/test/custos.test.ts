import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Custos, CustosError, decodeJwt, memoryStorage } from '../src/index.js';
import { ISSUER, REDIRECT, fakeServer, json, jwt, tokenResponse } from './helpers.js';

function client(fetch: typeof globalThis.fetch, extra: Partial<ConstructorParameters<typeof Custos>[0]> = {}) {
  return new Custos({ clientId: 'app', redirectUri: REDIRECT, issuer: ISSUER, fetch, ...extra });
}

/** Starts a login and returns the callback URL the server would redirect to. */
async function startLogin(custos: Custos, appState?: unknown) {
  const url = new URL(await custos.buildAuthorizeUrl(appState === undefined ? {} : { appState }));
  return { url, callback: `${REDIRECT}?code=the-code&state=${url.searchParams.get('state')}` };
}

const okServer = () =>
  fakeServer({
    '/api/v1/auth/token': () => json(tokenResponse()),
    '/api/v1/auth/userinfo': () => json({ sub: 'user-1', email: 'user-1@test.dev', name: 'Ada Lovelace' }),
    '/api/v1/auth/logout': () => new Response(null, { status: 204 }),
    '/api/v1/auth/revoke': () => json({ revoked: true }),
  });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('config', () => {
  it('rejects missing or relative settings', () => {
    expect(() => new Custos({ clientId: '', redirectUri: REDIRECT })).toThrow(CustosError);
    expect(() => new Custos({ clientId: 'a', redirectUri: '/callback' })).toThrow(/absolute/);
  });
});

describe('login', () => {
  it('builds an authorize URL with S256 PKCE and a fresh state every time', async () => {
    const custos = client(okServer().fetch);
    const first = new URL(await custos.buildAuthorizeUrl({ loginHint: 'ada@test.dev' }));
    const second = new URL(await custos.buildAuthorizeUrl());

    expect(first.origin + first.pathname).toBe(`${ISSUER}/v1/auth/authorize`);
    expect(first.searchParams.get('response_type')).toBe('code');
    expect(first.searchParams.get('code_challenge_method')).toBe('S256');
    expect(first.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(first.searchParams.get('scope')).toBe('openid profile email');
    expect(first.searchParams.get('login_hint')).toBe('ada@test.dev');
    expect(first.searchParams.get('state')).not.toBe(second.searchParams.get('state'));
  });

  it('does not let extra params override the protocol ones', async () => {
    const custos = client(okServer().fetch);
    const url = new URL(await custos.buildAuthorizeUrl({ params: { client_id: 'evil', ui_locales: 'es' } }));
    expect(url.searchParams.get('client_id')).toBe('app');
    expect(url.searchParams.get('ui_locales')).toBe('es');
  });
});

describe('handleCallback', () => {
  it('exchanges the code with the PKCE verifier, stores the session and cleans the URL', async () => {
    const server = okServer();
    const custos = client(server.fetch);
    const onLogin = vi.fn();
    custos.on('login', onLogin);
    const { callback } = await startLogin(custos, { returnTo: '/billing' });
    window.history.replaceState(null, '', callback);

    expect(custos.hasCallbackParams()).toBe(true);
    const result = await custos.handleCallback();

    const exchange = server.calls.find((c) => c.path === '/api/v1/auth/token')!;
    expect(exchange.body?.get('grant_type')).toBe('authorization_code');
    expect(exchange.body?.get('code')).toBe('the-code');
    expect(exchange.body?.get('code_verifier')).toMatch(/^[\w-]{43}$/);
    expect(result.appState).toEqual({ returnTo: '/billing' });
    expect(result.user).toMatchObject({ sub: 'user-1', name: 'Ada Lovelace', tenantId: 't1' });
    expect(custos.isAuthenticated()).toBe(true);
    expect(onLogin).toHaveBeenCalledOnce();
    expect(window.location.search).toBe('');
  });

  it('reads the parameters from a hash-router URL', async () => {
    const custos = client(okServer().fetch);
    const { url } = await startLogin(custos);
    const href = `http://localhost:3000/#/auth/callback?code=c&state=${url.searchParams.get('state')}`;
    window.history.replaceState(null, '', href);

    await custos.handleCallback();
    expect(window.location.hash).toBe('#/auth/callback');
  });

  it('accepts a state only once', async () => {
    const custos = client(okServer().fetch);
    const { callback } = await startLogin(custos);
    await custos.handleCallback(callback);
    await expect(custos.handleCallback(callback)).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('rejects a state it did not create', async () => {
    const custos = client(okServer().fetch);
    await expect(custos.handleCallback(`${REDIRECT}?code=x&state=forged`)).rejects.toMatchObject({
      code: 'invalid_state',
    });
  });

  it('surfaces OAuth errors from the server', async () => {
    const custos = client(okServer().fetch);
    const onError = vi.fn();
    custos.on('error', onError);
    const error = await custos
      .handleCallback(`${REDIRECT}?error=access_denied&error_description=Denied`)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'oauth_error', oauthError: 'access_denied', message: 'Denied' });
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('unwraps the { code, message, data } envelope and falls back to token claims without userinfo', async () => {
    const server = fakeServer({
      '/api/v1/auth/token': () => json({ code: 200, message: 'success', data: tokenResponse('user-9') }),
      '/api/v1/auth/userinfo': () => json({ message: 'down' }, 503),
    });
    const custos = client(server.fetch);
    const { callback } = await startLogin(custos);
    const { user } = await custos.handleCallback(callback);
    expect(user).toMatchObject({ sub: 'user-9', email: 'user-9@test.dev', givenName: 'Ada' });
  });

  it('turns server error bodies into readable messages', async () => {
    const server = fakeServer({
      '/api/v1/auth/token': () => json({ code: 401, message: 'Código de autorización inválido' }, 401),
    });
    const custos = client(server.fetch);
    const { callback } = await startLogin(custos);
    await expect(custos.handleCallback(callback)).rejects.toMatchObject({
      code: 'http_error',
      status: 401,
      message: 'Código de autorización inválido',
    });
  });
});

describe('refresh', () => {
  async function loggedIn(server = okServer(), extra = {}) {
    const custos = client(server.fetch, { autoRefresh: false, ...extra });
    const { callback } = await startLogin(custos);
    await custos.handleCallback(callback);
    return { custos, server };
  }

  it('shares one request between concurrent calls and keeps a non-rotated refresh token', async () => {
    const { custos, server } = await loggedIn();
    const { refresh_token: _, ...withoutRefresh } = tokenResponse();
    vi.mocked(server.fetch).mockClear().mockImplementation(async () => json(withoutRefresh));

    const [a, b] = await Promise.all([custos.refresh(), custos.refresh()]);
    expect(a).toBe(b);
    expect(server.fetch).toHaveBeenCalledTimes(1);
    expect(custos.getState().tokens?.refreshToken).toBe('refresh-user-1');
  });

  it('ends the session when the refresh token is rejected', async () => {
    const { custos, server } = await loggedIn();
    vi.mocked(server.fetch).mockImplementation(async () => json({ error: 'invalid_grant' }, 400));
    const onLogout = vi.fn();
    custos.on('logout', onLogout);

    await expect(custos.refresh()).rejects.toMatchObject({ code: 'login_required' });
    expect(custos.isAuthenticated()).toBe(false);
    expect(onLogout).toHaveBeenCalledWith({ reason: 'expired' });
  });

  it('keeps the session when the refresh fails for network reasons', async () => {
    const { custos, server } = await loggedIn();
    vi.mocked(server.fetch).mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(custos.refresh()).rejects.toMatchObject({ code: 'network_error', retryable: true });
    expect(custos.isAuthenticated()).toBe(true);
  });

  it('renews a token about to expire in getValidAccessToken()', async () => {
    const server = fakeServer({
      '/api/v1/auth/token': (_, init) => {
        const grant = (init.body as URLSearchParams).get('grant_type');
        return json({ ...tokenResponse(), access_token: jwt({ sub: 'user-1', grant }, grant === 'refresh_token' ? 3600 : 30) });
      },
    });
    const { custos } = await loggedIn(server, { endpoints: { userinfo: false } });

    const token = await custos.getValidAccessToken();
    expect(decodeJwt<{ grant: string }>(token!)?.grant).toBe('refresh_token');
  });

  it('schedules the refresh before expiry', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const server = okServer();
    const custos = client(server.fetch, { refreshLeeway: 60 });
    const { callback } = await startLogin(custos);
    await custos.handleCallback(callback);
    server.calls.length = 0;

    await vi.advanceTimersByTimeAsync(3600_000 - 61_000);
    expect(server.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(server.calls.map((c) => c.body?.get('grant_type'))).toEqual(['refresh_token']);
    custos.destroy();
  });

  it('restore() renews an expired session at startup', async () => {
    const { custos: first, server } = await loggedIn(okServer());
    first.destroy();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2 * 3600_000);

    const second = client(server.fetch, { autoRefresh: false });
    expect(second.isAuthenticated()).toBe(false);
    vi.useRealTimers();
    await expect(second.restore()).resolves.toBe(true);
    expect(second.isAuthenticated()).toBe(true);
  });
});

describe('fetch', () => {
  it('adds the bearer token and retries once after a 401', async () => {
    const server = okServer();
    const custos = client(server.fetch, { autoRefresh: false });
    const { callback } = await startLogin(custos);
    await custos.handleCallback(callback);

    let attempts = 0;
    const api = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      attempts++;
      const auth = new Headers(init?.headers).get('Authorization');
      if (url(_input).pathname === '/api/v1/auth/token') return server.fetch(_input, init);
      return attempts === 1 ? new Response(null, { status: 401 }) : json({ auth });
    });
    const url = (input: RequestInfo | URL) => new URL(String(input));
    const withApi = client(api as unknown as typeof fetch, { autoRefresh: false });

    const response = await withApi.fetch(`${ISSUER}/api/v1/users`);
    expect(response.status).toBe(200);
    expect((await response.json()).auth).toMatch(/^Bearer /);
  });

  it('throws login_required without a session', async () => {
    await expect(client(okServer().fetch).fetch(`${ISSUER}/x`)).rejects.toMatchObject({ code: 'login_required' });
  });
});

describe('logout', () => {
  it('ends the server session, revokes the refresh token and clears local state even if the server fails', async () => {
    const server = okServer();
    const custos = client(server.fetch, { autoRefresh: false });
    const { callback } = await startLogin(custos);
    await custos.handleCallback(callback);
    server.calls.length = 0;
    vi.mocked(server.fetch).mockImplementation(async (input) => {
      server.calls.push({ path: new URL(String(input)).pathname, init: {}, body: null });
      return json({ message: 'boom' }, 500);
    });

    await custos.logout();
    expect(server.calls.map((c) => c.path).sort()).toEqual(['/api/v1/auth/logout', '/api/v1/auth/revoke']);
    expect(custos.isAuthenticated()).toBe(false);
    expect(localStorage.length).toBe(0);
  });
});

describe('tabs', () => {
  it('follows a logout made in another tab', async () => {
    const custos = client(okServer().fetch, { autoRefresh: false });
    const { callback } = await startLogin(custos);
    await custos.handleCallback(callback);
    const onLogout = vi.fn();
    custos.on('logout', onLogout);

    const key = 'custos.app.session';
    localStorage.removeItem(key);
    window.dispatchEvent(new StorageEvent('storage', { key }));
    expect(onLogout).toHaveBeenCalledWith({ reason: 'remote' });
    expect(custos.isAuthenticated()).toBe(false);
  });

  it('keeps sessions of different client ids apart', async () => {
    const storage = memoryStorage();
    const a = client(okServer().fetch, { storage, autoRefresh: false });
    const { callback } = await startLogin(a);
    await a.handleCallback(callback);
    const b = new Custos({ clientId: 'other', redirectUri: REDIRECT, issuer: ISSUER, storage });
    expect(a.isAuthenticated()).toBe(true);
    expect(b.isAuthenticated()).toBe(false);
  });
});

describe('utilities', () => {
  it('decodeJwt reads base64url and UTF-8 payloads', () => {
    expect(decodeJwt(jwt({ name: 'José Ñandú', path: '??>>' }))).toMatchObject({ name: 'José Ñandú' });
    expect(decodeJwt('not-a-jwt')).toBeNull();
  });

  it('recognizes CustosError from another copy of the package', () => {
    const foreign = new CustosError('network_error', 'x');
    const clone = Object.assign(Object.create(Error.prototype), foreign);
    Object.defineProperty(clone, Symbol.for('@alimzen/custos:error'), { value: true });
    expect(clone instanceof CustosError).toBe(true);
    expect(new Error('x') instanceof CustosError).toBe(false);
  });
});
