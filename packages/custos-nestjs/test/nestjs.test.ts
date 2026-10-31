import 'reflect-metadata';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type KeyLike } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CurrentAuth, CustosModule, Public, RequirePermissions, RequireRoles, type CustosClaims } from '../src/index.js';

const ISSUER = 'https://auth.test';

@Controller()
@RequireRoles('admin', 'owner')
class AdminController {
  @Get('me')
  me(@CurrentAuth() auth: CustosClaims, @CurrentAuth('email') email: string) {
    return { sub: auth.sub, email };
  }

  @Get('billing')
  @RequirePermissions('billing:read')
  billing() {
    return { ok: true };
  }

  @Get('health')
  @Public()
  health() {
    return { status: 'up' };
  }
}

let app: INestApplication;
let privateKey: KeyLike;

const sign = (claims: Record<string, unknown>) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('user-1')
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), alg: 'RS256' }] });

  const moduleRef = await Test.createTestingModule({
    imports: [
      CustosModule.forRootAsync({ useFactory: () => ({ issuer: ISSUER, keys }), globalGuard: true }),
    ],
    controllers: [AdminController],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(() => app?.close());

describe('CustosModule with the global guard', () => {
  it('lets @Public routes through without a token', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'up' });
  });

  it('answers 401 without a token', async () => {
    const res = await request(app.getHttpServer()).get('/me').expect(401);
    expect(res.body).toMatchObject({ error: 'invalid_token' });
  });

  it('injects the claims with @CurrentAuth', async () => {
    const token = await sign({ email: 'ada@test.dev', tenantRole: 'admin' });
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { sub: 'user-1', email: 'ada@test.dev' });
  });

  it('combines class roles and method permissions', async () => {
    const admin = await sign({ tenantRole: 'admin', permissions: ['billing:read'] });
    const viewer = await sign({ tenantRole: 'viewer', permissions: ['billing:read'] });
    const noPerm = await sign({ tenantRole: 'owner', permissions: [] });
    const server = app.getHttpServer();

    await request(server).get('/billing').set('Authorization', `Bearer ${admin}`).expect(200);
    await request(server).get('/billing').set('Authorization', `Bearer ${viewer}`).expect(403);
    const res = await request(server).get('/billing').set('Authorization', `Bearer ${noPerm}`).expect(403);
    expect(res.body.error_description).toBe('Missing permissions: billing:read');
  });
});
