import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey, type KeyLike } from 'jose';
import {
  CustosAuthError,
  assertRequirements,
  createVerifier,
  custosAuth,
  extractBearerToken,
  requireAuth,
  type AuthRequest,
} from '../src/index.js';

const ISSUER = 'https://auth.test';
let privateKey: KeyLike;
let otherKey: KeyLike;
let keys: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair('RS256')).privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }] });
});

function sign(claims: Record<string, unknown> = {}, opts: { key?: KeyLike; exp?: string | number; iss?: string; aud?: string } = {}) {
  return new SignJWT({ email: 'ada@test.dev', permissions: ['users:read'], tenantRole: 'admin', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setSubject('user-1')
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? 'app')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(opts.key ?? privateKey);
}

describe('createVerifier', () => {
  it('accepts a valid token and returns its claims', async () => {
    const verifier = createVerifier({ issuer: `${ISSUER}/`, audience: 'app', keys });
    await expect(verifier.verify(await sign())).resolves.toMatchObject({ sub: 'user-1', email: 'ada@test.dev' });
  });

  it.each([
    ['another key', { key: undefined as KeyLike | undefined }, 'invalid_token'],
    ['another issuer', { iss: 'https://evil.test' }, 'invalid_token'],
    ['another audience', { aud: 'other-app' }, 'invalid_token'],
  ])('rejects a token signed with %s', async (_, opts, code) => {
    const verifier = createVerifier({ issuer: ISSUER, audience: 'app', keys });
    const token = await sign({}, { ...opts, key: 'key' in opts ? otherKey : privateKey });
    await expect(verifier.verify(token)).rejects.toMatchObject({ code, status: 401 });
  });

  it('reports expired tokens with their own code', async () => {
    const verifier = createVerifier({ issuer: ISSUER, keys, clockTolerance: 0 });
    const token = await sign({}, { exp: Math.floor(Date.now() / 1000) - 60 });
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'token_expired' });
  });

  it('refuses authorization codes used as access tokens', async () => {
    const verifier = createVerifier({ issuer: ISSUER, keys });
    await expect(verifier.verify(await sign({ type: 'authorization_code' }))).rejects.toMatchObject({
      code: 'invalid_token',
    });
  });

  it('checks the session with introspection when configured', async () => {
    const fetch = vi.fn(async () => Response.json({ code: 200, message: 'ok', data: { active: false } }));
    const verifier = createVerifier({
      issuer: ISSUER,
      keys,
      introspection: { clientId: 'api', clientSecret: 's3cret', fetch: fetch as unknown as typeof globalThis.fetch },
    });
    const token = await sign();
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'inactive_token' });
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'inactive_token' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${ISSUER}/api/v1/auth/introspect`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('api:s3cret')}`);
  });
});

describe('helpers', () => {
  it('extracts bearer tokens strictly', () => {
    expect(extractBearerToken('Bearer abc')).toBe('abc');
    expect(extractBearerToken('bearer   abc ')).toBe('abc');
    expect(extractBearerToken(['Bearer x'])).toBe('x');
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('Bearer a b')).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it('checks permissions (all) and roles (any)', () => {
    const claims = { sub: 'u', permissions: ['a', 'b'], tenantRole: 'admin' };
    expect(() => assertRequirements(claims, { permissions: ['a', 'b'], roles: ['owner', 'admin'] })).not.toThrow();
    expect(() => assertRequirements(claims, { permissions: ['c'] })).toThrow(/Missing permissions: c/);
    expect(() => assertRequirements(claims, { roles: ['owner'] })).toThrow(CustosAuthError);
    expect(() => assertRequirements({ sub: 'u', permissions: ['*'] }, { permissions: ['x'] })).not.toThrow();
  });
});

describe('express middleware', () => {
  function res() {
    const r = { statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string> };
    return Object.assign(r, {
      status(code: number) {
        r.statusCode = code;
        return this;
      },
      setHeader(name: string, value: string) {
        r.headers[name] = value;
      },
      json(body: unknown) {
        r.body = body;
        return this;
      },
    });
  }

  it('sets req.auth and calls next', async () => {
    const req: AuthRequest = { headers: { authorization: `Bearer ${await sign()}` } };
    const next = vi.fn();
    await custosAuth({ issuer: ISSUER, keys })(req, res(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.auth?.sub).toBe('user-1');
  });

  it('answers 401 with WWW-Authenticate when the token is missing', async () => {
    const r = res();
    await custosAuth({ issuer: ISSUER, keys })({ headers: {} }, r, vi.fn());
    expect(r.statusCode).toBe(401);
    expect(r.headers['WWW-Authenticate']).toBe('Bearer error="invalid_token"');
    expect(r.body).toEqual({ error: 'invalid_token', error_description: 'Missing bearer token' });
  });

  it('lets anonymous requests through when optional', async () => {
    const next = vi.fn();
    await custosAuth({ issuer: ISSUER, keys, optional: true })({ headers: {} }, res(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('requireAuth answers 403 on missing permissions', async () => {
    const r = res();
    requireAuth({ permissions: ['billing:write'] })({ headers: {}, auth: { sub: 'u', permissions: [] } }, r, vi.fn());
    expect(r.statusCode).toBe(403);
    expect(r.body).toMatchObject({ error: 'insufficient_scope' });
  });
});
