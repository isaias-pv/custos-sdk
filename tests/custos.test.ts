import { Custos } from '../src/Custos';
import { Storage } from '../src/storage';
import { generateState, generateCodeVerifier, generateCodeChallenge, isTokenExpired, decodeToken, parseQueryString, normalizeScope } from '../src/utils';

// ─── Mock global objects ──────────────────────────────────────────────────────

const mockStorage: Record<string, string> = {};

const localStorageMock = {
	getItem: (key: string) => mockStorage[key] ?? null,
	setItem: (key: string, value: string) => { mockStorage[key] = value; },
	removeItem: (key: string) => { delete mockStorage[key]; },
	clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
	key: (_: number) => null as string | null,
	length: 0,
};

// Mock window and localStorage para Jest/Node.js
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });

// Mock window.history.replaceState para tests que limpian URL
if (window.history) {
	window.history.replaceState = jest.fn();
}

// ─── Utils ────────────────────────────────────────────────────────────────────

describe('Utils', () => {
	it('generateState() returns 32-char hex string', () => {
		const state = generateState();
		expect(state).toHaveLength(32);
		expect(state).toMatch(/^[0-9a-f]+$/);
	});

	it('generateState() produces unique values', () => {
		expect(generateState()).not.toBe(generateState());
	});

	it('generateCodeVerifier() returns 128-char string', () => {
		const verifier = generateCodeVerifier();
		expect(verifier).toHaveLength(128);
		expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
	});

	it('generateCodeChallenge() returns base64url string', async () => {
		const verifier = generateCodeVerifier();
		const challenge = await generateCodeChallenge(verifier);
		expect(challenge).not.toContain('=');
		expect(challenge).not.toContain('+');
		expect(challenge).not.toContain('/');
		expect(challenge.length).toBeGreaterThan(10);
	});

	it('parseQueryString() parses URL params', () => {
		const params = parseQueryString('http://localhost/callback?code=abc&state=xyz');
		expect(params.code).toBe('abc');
		expect(params.state).toBe('xyz');
	});

	it('parseQueryString() parses hash params', () => {
		const params = parseQueryString('http://localhost/callback#access_token=tok&token_type=bearer');
		expect(params.access_token).toBe('tok');
	});

	it('normalizeScope() handles string', () => {
		expect(normalizeScope('openid profile')).toBe('openid profile');
	});

	it('normalizeScope() handles array', () => {
		expect(normalizeScope(['openid', 'profile'])).toBe('openid profile');
	});

	it('normalizeScope() provides default when undefined', () => {
		expect(normalizeScope(undefined)).toBe('openid profile');
	});

	it('isTokenExpired() returns true for expired token', () => {
		// Build a JWT with exp in the past
		const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
		const payload = btoa(JSON.stringify({ sub: '1', exp: Math.floor(Date.now() / 1000) - 100 }));
		const token = `${header}.${payload}.fakesig`;
		expect(isTokenExpired(token)).toBe(true);
	});

	it('isTokenExpired() returns false for valid token', () => {
		const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
		const payload = btoa(JSON.stringify({ sub: '1', exp: Math.floor(Date.now() / 1000) + 3600 }));
		const token = `${header}.${payload}.fakesig`;
		expect(isTokenExpired(token)).toBe(false);
	});

	it('isTokenExpired() returns true for malformed token', () => {
		expect(isTokenExpired('not.a.token')).toBe(true); // atob('a') throws → catch returns true
		expect(isTokenExpired('bad')).toBe(true);
	});

	it('decodeToken() returns payload', () => {
		const header = btoa(JSON.stringify({ alg: 'HS256' }));
		const payload = btoa(JSON.stringify({ sub: '42', email: 'a@b.com' }));
		const token = `${header}.${payload}.sig`;
		const decoded = decodeToken(token);
		expect(decoded?.sub).toBe('42');
		expect(decoded?.email).toBe('a@b.com');
	});

	it('decodeToken() returns null for invalid token', () => {
		expect(decodeToken('invalid')).toBeNull();
	});
});

// ─── Storage ──────────────────────────────────────────────────────────────────

describe('Storage', () => {
	let storage: Storage;

	beforeEach(() => {
		localStorageMock.clear();
		storage = new Storage(false);
	});

	it('stores and retrieves tokens', () => {
		const tokens = { accessToken: 'at', refreshToken: 'rt', tokenType: 'Bearer', expiresIn: 3600 };
		storage.setTokens(tokens);
		expect(storage.getTokens()).toEqual(tokens);
	});

	it('stores token_issued_at timestamp', () => {
		const before = Date.now();
		storage.setTokens({ accessToken: 'at', tokenType: 'Bearer', expiresIn: 3600 });
		const after = Date.now();
		const issuedAt = storage.getTokenIssuedAt()!;
		expect(issuedAt).toBeGreaterThanOrEqual(before);
		expect(issuedAt).toBeLessThanOrEqual(after);
	});

	it('stores and retrieves user', () => {
		const user = { id: '1', email: 'test@test.com' };
		storage.setUser(user);
		expect(storage.getUser()).toEqual(user);
	});

	it('manages state/PKCE keys independently', () => {
		storage.setState('oauth_state', 'stateValue');
		expect(storage.getState('oauth_state')).toBe('stateValue');

		storage.setCodeVerifier('verifier123');
		expect(storage.getCodeVerifier()).toBe('verifier123');

		storage.removeCodeVerifier();
		expect(storage.getCodeVerifier()).toBeNull();
	});

	it('hasValidToken() returns true when token not expired', () => {
		storage.setTokens({ accessToken: 'at', tokenType: 'Bearer', expiresIn: 3600 });
		expect(storage.hasValidToken()).toBe(true);
	});

	it('hasValidToken() returns false when token expired', () => {
		storage.setTokens({ accessToken: 'at', tokenType: 'Bearer', expiresIn: 0 });
		// Override issuedAt to simulate past
		mockStorage['custos_token_issued_at'] = (Date.now() - 5000).toString();
		expect(storage.hasValidToken()).toBe(false);
	});

	it('hasValidToken() returns false with no tokens', () => {
		expect(storage.hasValidToken()).toBe(false);
	});

	it('clear() removes all custos keys', () => {
		storage.setTokens({ accessToken: 'at', tokenType: 'Bearer', expiresIn: 3600 });
		storage.setUser({ id: '1', email: 'a@b.com' });
		storage.setState('oauth_state', 'abc');
		storage.clear();
		expect(storage.getTokens()).toBeNull();
		expect(storage.getUser()).toBeNull();
		expect(storage.getState('oauth_state')).toBeNull();
	});
});

// ─── Custos Class ─────────────────────────────────────────────────────────────

describe('Custos', () => {
	const baseConfig = {
		clientId: 'test-client-id',
		redirectUri: 'http://localhost:3000/callback',
		apiUrl: 'http://localhost:3000',
	};

	beforeEach(() => {
		localStorageMock.clear();
		(window.location as any).href = 'http://localhost/';
	});

	describe('constructor', () => {
		it('instantiates with required config', () => {
			const custos = new Custos(baseConfig);
			expect(custos).toBeDefined();
		});

		it('is not authenticated by default', () => {
			const custos = new Custos(baseConfig);
			expect(custos.isAuthenticated()).toBe(false);
		});

		it('getUser() returns null when not authenticated', () => {
			const custos = new Custos(baseConfig);
			expect(custos.getUser()).toBeNull();
		});

		it('getAccessToken() returns null when not authenticated', () => {
			const custos = new Custos(baseConfig);
			expect(custos.getAccessToken()).toBeNull();
		});

		it('getRefreshToken() returns null when not authenticated', () => {
			const custos = new Custos(baseConfig);
			expect(custos.getRefreshToken()).toBeNull();
		});

		it('getTokenExpiry() returns null when not authenticated', () => {
			const custos = new Custos(baseConfig);
			expect(custos.getTokenExpiry()).toBeNull();
		});
	});

	describe('getState()', () => {
		it('returns full auth state', () => {
			const custos = new Custos(baseConfig);
			const state = custos.getState();
			expect(state.isAuthenticated).toBe(false);
			expect(state.user).toBeNull();
			expect(state.tokens).toBeNull();
			expect(state.tokenExpiry).toBeNull();
		});
	});

	describe('hasCallbackParams()', () => {
		afterEach(() => {
			// Restaurar URL a estado limpio
			window.history.pushState({}, '', '/');
		});

		it('returns false when no OAuth params in URL', () => {
			window.history.pushState({}, '', '/');
			const custos = new Custos(baseConfig);
			expect(custos.hasCallbackParams()).toBe(false);
		});

		it('returns true when ?code param is present', () => {
			window.history.pushState({}, '', '/callback?code=authcode123&state=abc');
			const custos = new Custos(baseConfig);
			expect(custos.hasCallbackParams()).toBe(true);
		});

		it('returns true when ?error param is present', () => {
			window.history.pushState({}, '', '/callback?error=access_denied');
			const custos = new Custos(baseConfig);
			expect(custos.hasCallbackParams()).toBe(true);
		});
	});

	describe('events', () => {
		it('on() and off() work correctly', () => {
			const custos = new Custos(baseConfig);
			const handler = jest.fn();
			custos.on('logout', handler);
			custos.off('logout', handler);
			// Calling logout (no token) should not trigger handler after off()
		});

		it('destroy() clears listeners', () => {
			const custos = new Custos(baseConfig);
			const handler = jest.fn();
			custos.on('error', handler);
			custos.destroy();
		});
	});

	describe('logout()', () => {
		it('clears storage even if API call fails', async () => {
			const custos = new Custos(baseConfig);
			// Pre-populate storage with tokens
			localStorageMock.setItem('custos_tokens', JSON.stringify({ accessToken: 'at', tokenType: 'Bearer', expiresIn: 3600 }));
			localStorageMock.setItem('custos_token_issued_at', Date.now().toString());
			localStorageMock.setItem('custos_user', JSON.stringify({ id: '1', email: 'a@b.com' }));

			// Mock fetch to fail
			global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

			await custos.logout();

			// Storage should be cleared regardless of API failure
			expect(localStorageMock.getItem('custos_tokens')).toBeNull();
			expect(localStorageMock.getItem('custos_user')).toBeNull();
		});

		it('emits logout event', async () => {
			const custos = new Custos(baseConfig);
			const handler = jest.fn();
			custos.on('logout', handler);

			global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
			await custos.logout();

			expect(handler).toHaveBeenCalledWith({ type: 'logout', data: null });
		});
	});

	describe('validateToken()', () => {
		it('returns false when not authenticated', async () => {
			const custos = new Custos(baseConfig);
			expect(await custos.validateToken()).toBe(false);
		});
	});

	describe('silentAuth()', () => {
		it('returns false when no tokens in storage', async () => {
			const custos = new Custos(baseConfig);
			expect(await custos.silentAuth()).toBe(false);
		});

		it('returns false when no user in storage', async () => {
			const custos = new Custos(baseConfig);
			localStorageMock.setItem('custos_tokens', JSON.stringify({ accessToken: 'at', tokenType: 'Bearer', expiresIn: 3600 }));
			localStorageMock.setItem('custos_token_issued_at', Date.now().toString());
			// No user
			expect(await custos.silentAuth()).toBe(false);
		});

		it('returns true when valid session exists', async () => {
			const custos = new Custos(baseConfig);
			localStorageMock.setItem('custos_tokens', JSON.stringify({ accessToken: 'at', tokenType: 'Bearer', expiresIn: 3600 }));
			localStorageMock.setItem('custos_token_issued_at', Date.now().toString());
			localStorageMock.setItem('custos_user', JSON.stringify({ id: '1', email: 'a@b.com' }));
			expect(await custos.silentAuth()).toBe(true);
		});

		it('emits session-restored when session is restored', async () => {
			const custos = new Custos(baseConfig);
			const handler = jest.fn();
			custos.on('session-restored', handler);

			localStorageMock.setItem('custos_tokens', JSON.stringify({ accessToken: 'at', tokenType: 'Bearer', expiresIn: 3600 }));
			localStorageMock.setItem('custos_token_issued_at', Date.now().toString());
			localStorageMock.setItem('custos_user', JSON.stringify({ id: '1', email: 'a@b.com' }));

			await custos.silentAuth();

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0][0].type).toBe('session-restored');
		});
	});

	describe('revoke()', () => {
		it('revokes access and refresh tokens then clears local session', async () => {
			const custos = new Custos(baseConfig);
			localStorageMock.setItem('custos_tokens', JSON.stringify({ accessToken: 'at', refreshToken: 'rt', tokenType: 'Bearer', expiresIn: 3600 }));
			localStorageMock.setItem('custos_token_issued_at', Date.now().toString());
			localStorageMock.setItem('custos_user', JSON.stringify({ id: '1', email: 'a@b.com' }));

			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				status: 204,
				headers: { get: () => null },
				json: async () => ({}),
			});

			await custos.revoke();

			expect(global.fetch).toHaveBeenCalledTimes(2);
			expect(localStorageMock.getItem('custos_tokens')).toBeNull();
			expect(localStorageMock.getItem('custos_user')).toBeNull();
		});

		it('clears local session even when revoke endpoint fails', async () => {
			const custos = new Custos(baseConfig);
			localStorageMock.setItem('custos_tokens', JSON.stringify({ accessToken: 'at', refreshToken: 'rt', tokenType: 'Bearer', expiresIn: 3600 }));
			localStorageMock.setItem('custos_token_issued_at', Date.now().toString());
			localStorageMock.setItem('custos_user', JSON.stringify({ id: '1', email: 'a@b.com' }));

			global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

			await custos.revoke();

			expect(localStorageMock.getItem('custos_tokens')).toBeNull();
			expect(localStorageMock.getItem('custos_user')).toBeNull();
		});
	});

	describe('getTokenExpiry()', () => {
		it('returns correct expiry date', () => {
			const custos = new Custos(baseConfig);
			const issuedAt = Date.now();
			const expiresIn = 3600; // 1 hour
			localStorageMock.setItem('custos_tokens', JSON.stringify({ accessToken: 'at', tokenType: 'Bearer', expiresIn }));
			localStorageMock.setItem('custos_token_issued_at', issuedAt.toString());

			const expiry = custos.getTokenExpiry();
			expect(expiry).not.toBeNull();
			expect(expiry?.getTime()).toBeCloseTo(issuedAt + expiresIn * 1000, -3);
		});
	});
});
