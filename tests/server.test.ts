/** @jest-environment node */
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import * as http from 'http';
import { AddressInfo } from 'net';
import { createTokenVerifier, extractBearerToken } from '../src/server';

describe('createTokenVerifier', () => {
	let server: http.Server;
	let issuer: string;
	let privateKey: CryptoKey;
	const kid = 'test-kid';

	beforeAll(async () => {
		const pair = await generateKeyPair('RS256');
		privateKey = pair.privateKey as CryptoKey;
		const jwk = { ...(await exportJWK(pair.publicKey)), kid, use: 'sig', alg: 'RS256' };
		server = http
			.createServer((req, res) => {
				res.setHeader('content-type', 'application/json');
				res.end(JSON.stringify({ keys: [jwk] }));
			})
			.listen(0);
		await new Promise((r) => server.once('listening', r));
		issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(() => server.close());

	const sign = (claims: Record<string, unknown> = {}, iss = () => issuer, exp = '5m') =>
		new SignJWT({ userId: 'u1', ...claims })
			.setProtectedHeader({ alg: 'RS256', kid })
			.setIssuer(iss())
			.setSubject('u1')
			.setIssuedAt()
			.setExpirationTime(exp)
			.sign(privateKey);

	it('verifica un token válido', async () => {
		const verifier = createTokenVerifier({ issuer, jwksUri: `${issuer}/jwks` });
		const payload = await verifier.verify(await sign());
		expect(payload.sub).toBe('u1');
	});

	it('rechaza issuer distinto', async () => {
		const verifier = createTokenVerifier({ issuer, jwksUri: `${issuer}/jwks` });
		await expect(verifier.verify(await sign({}, () => 'https://otro.com'))).rejects.toThrow();
	});

	it('rechaza tokens expirados', async () => {
		const verifier = createTokenVerifier({ issuer, jwksUri: `${issuer}/jwks`, clockToleranceSeconds: 0 });
		await expect(verifier.verify(await sign({}, () => issuer, '-1m'))).rejects.toThrow();
	});

	it('valida audience cuando se indica', async () => {
		const verifier = createTokenVerifier({ issuer, jwksUri: `${issuer}/jwks`, audience: 'app-1' });
		await expect(verifier.verify(await sign({ aud: 'app-2' }))).rejects.toThrow();
		await expect(verifier.verify(await sign({ aud: 'app-1' }))).resolves.toBeDefined();
	});

	it('extrae bearer token', () => {
		expect(extractBearerToken('Bearer abc')).toBe('abc');
		expect(extractBearerToken('Basic abc')).toBeNull();
		expect(extractBearerToken(undefined)).toBeNull();
	});
});
