import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationInitStatus, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, type ActivatedRouteSnapshot, type RouterStateSnapshot, type UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  CUSTOS_AUTH,
  SKIP_CUSTOS_AUTH,
  custosGuard,
  custosGuestGuard,
  custosInterceptor,
  provideCustos,
  urlAllowed,
  type CustosAuth,
} from '../src/index.js';

const ISSUER = 'https://auth.test';

function b64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
function jwt(claims: Record<string, unknown>, ttl = 3600) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: 'RS256' })}.${b64url({ iat: now, exp: now + ttl, ...claims })}.sig`;
}

/** Stores a session the way the core SDK does, so the client starts logged in. */
function seedSession(claims: Record<string, unknown> = {}, refreshToken = 'refresh-1') {
  const accessToken = jwt({ sub: 'user-1', ...claims });
  localStorage.setItem(
    'custos.app.session',
    JSON.stringify({
      tokens: { accessToken, refreshToken, tokenType: 'Bearer', expiresAt: Date.now() + 3600_000 },
      user: { sub: 'user-1', claims, ...claims },
    }),
  );
  return accessToken;
}

const tokenAnswer = async () =>
  Response.json({ access_token: jwt({ sub: 'user-1', fresh: true }), token_type: 'Bearer', expires_in: 3600 });
const tokenFetch = vi.fn(tokenAnswer);

async function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(withInterceptors([custosInterceptor])),
      provideHttpClientTesting(),
      provideCustos({
        clientId: 'app',
        redirectUri: 'http://localhost:3000/',
        issuer: ISSUER,
        autoRefresh: false,
        fetch: tokenFetch as unknown as typeof fetch,
      }),
    ],
  });
  await TestBed.inject(ApplicationInitStatus).donePromise;
  return {
    auth: TestBed.inject(CUSTOS_AUTH),
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
  };
}

function runGuard(guard: ReturnType<typeof custosGuard>, url = '/billing') {
  return TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  ) as Promise<boolean | UrlTree> | boolean | UrlTree;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  tokenFetch.mockReset().mockImplementation(tokenAnswer);
  TestBed.resetTestingModule();
});

describe('urlAllowed', () => {
  it('matches on path boundaries only', () => {
    expect(urlAllowed('https://auth.test/api/x', [ISSUER])).toBe(true);
    expect(urlAllowed('https://auth.test', [ISSUER])).toBe(true);
    expect(urlAllowed('https://auth.test.evil.com/x', [ISSUER])).toBe(false);
    expect(urlAllowed('/api/x', [/^\/api\//])).toBe(true);
  });
});

describe('signals', () => {
  it('reflect the stored session and follow logout', async () => {
    seedSession({ email: 'ada@test.dev', permissions: ['billing:read'], role: 'admin' });
    const { auth, backend } = await setup();
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.sub).toBe('user-1');
    expect(auth.hasPermission('billing:read')).toBe(true);
    expect(auth.hasRole('owner', 'admin')).toBe(true);

    tokenFetch.mockImplementation(async () => new Response(null, { status: 204 }) as never);
    await auth.logout();
    expect(auth.isAuthenticated()).toBe(false);
    backend.verify();
  });
});

describe('custosInterceptor', () => {
  it('sends the token to the issuer only', async () => {
    const token = seedSession();
    const { http, backend } = await setup();

    const own = firstValueFrom(http.get(`${ISSUER}/api/v1/users`));
    const foreign = firstValueFrom(http.get('https://cdn.other.com/x'));
    const skipped = firstValueFrom(
      http.get(`${ISSUER}/public`, { context: new (await import('@angular/common/http')).HttpContext().set(SKIP_CUSTOS_AUTH, true) }),
    );
    await Promise.resolve();
    await new Promise((r) => setTimeout(r));

    const ownReq = backend.expectOne(`${ISSUER}/api/v1/users`);
    expect(ownReq.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    ownReq.flush({});
    const foreignReq = backend.expectOne('https://cdn.other.com/x');
    expect(foreignReq.request.headers.has('Authorization')).toBe(false);
    foreignReq.flush({});
    const skippedReq = backend.expectOne(`${ISSUER}/public`);
    expect(skippedReq.request.headers.has('Authorization')).toBe(false);
    skippedReq.flush({});
    await Promise.all([own, foreign, skipped]);
  });

  it('renews the token and retries once after a 401', async () => {
    seedSession();
    const { http, backend } = await setup();

    const result = firstValueFrom(http.get<{ ok: boolean }>(`${ISSUER}/api/v1/me`));
    await new Promise((r) => setTimeout(r));
    backend.expectOne(`${ISSUER}/api/v1/me`).flush({}, { status: 401, statusText: 'Unauthorized' });
    await new Promise((r) => setTimeout(r, 10));

    const retry = backend.expectOne(`${ISSUER}/api/v1/me`);
    expect(retry.request.headers.get('Authorization')).toMatch(/^Bearer /);
    retry.flush({ ok: true });
    await expect(result).resolves.toEqual({ ok: true });
    expect(tokenFetch).toHaveBeenCalledTimes(1);
  });
});

describe('guards', () => {
  it('starts the login for anonymous users and remembers where they were going', async () => {
    const { auth } = await setup();
    const login = vi.spyOn(auth, 'login').mockResolvedValue();
    await expect(runGuard(custosGuard())).resolves.toBe(false);
    expect(login).toHaveBeenCalledWith({ appState: { returnTo: '/billing' } });
  });

  it('redirects to a sign-in route with returnTo when configured', async () => {
    await setup();
    const tree = (await runGuard(custosGuard({ redirectTo: '/auth/sign-in' }))) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(tree)).toBe('/auth/sign-in?returnTo=%2Fbilling');
  });

  it('checks permissions for logged-in users', async () => {
    seedSession({ permissions: ['users:read'] });
    await setup();
    await expect(runGuard(custosGuard({ permissions: ['users:read'] }))).resolves.toBe(true);
    const tree = (await runGuard(custosGuard({ permissions: ['billing:write'], forbiddenRedirectTo: '/403' }))) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(tree)).toBe('/403');
  });

  it('custosGuestGuard sends logged-in users away from the sign-in page', async () => {
    seedSession();
    await setup();
    const tree = runGuard(custosGuestGuard({ redirectTo: '/dashboard' }) as never) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(tree)).toBe('/dashboard');
  });
});

describe('initialization', () => {
  it('finishes a login on boot and keeps the app booting when it fails', async () => {
    window.history.replaceState(null, '', '/?code=x&state=unknown');
    const { auth } = await setup();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.error()?.code).toBe('invalid_state');
    expect(window.location.search).toBe('');
  });
});

export type { CustosAuth };
