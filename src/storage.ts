import { AuthTokens, User } from './types';

const STORAGE_PREFIX = 'custos_';

export class Storage {
	private storage: globalThis.Storage;

	constructor() {
		// 🔥 FIX: Siempre usar localStorage
		// sessionStorage se pierde en apps nativas cuando se cierra el navegador del sistema
		this.storage = localStorage;
	}

	// Tokens
	setTokens(tokens: AuthTokens): void {
		this.storage.setItem(`${STORAGE_PREFIX}tokens`, JSON.stringify(tokens));
		this.storage.setItem(`${STORAGE_PREFIX}token_issued_at`, Date.now().toString());
	}

	getTokens(): AuthTokens | null {
		const data = this.storage.getItem(`${STORAGE_PREFIX}tokens`);
		return data ? JSON.parse(data) : null;
	}

	getTokenIssuedAt(): number | null {
		const data = this.storage.getItem(`${STORAGE_PREFIX}token_issued_at`);
		return data ? parseInt(data, 10) : null;
	}

	// User
	setUser(user: User): void {
		this.storage.setItem(`${STORAGE_PREFIX}user`, JSON.stringify(user));
	}

	getUser(): User | null {
		const data = this.storage.getItem(`${STORAGE_PREFIX}user`);
		return data ? JSON.parse(data) : null;
	}

	// State & PKCE
	setState(key: string, value: string): void {
		const fullKey = `${STORAGE_PREFIX}${key}`;
		this.storage.setItem(fullKey, value);
	}

	getState(key: string): string | null {
		const fullKey = `${STORAGE_PREFIX}${key}`;
		const value = this.storage.getItem(fullKey);
		return value;
	}

	removeState(key: string): void {
		const fullKey = `${STORAGE_PREFIX}${key}`;
		this.storage.removeItem(fullKey);
	}

	// PKCE specific
	setCodeVerifier(codeVerifier: string): void {
		this.setState('code_verifier', codeVerifier);
	}

	getCodeVerifier(): string | null {
		return this.getState('code_verifier');
	}

	removeCodeVerifier(): void {
		this.removeState('code_verifier');
	}

	setCodeChallenge(codeChallenge: string): void {
		this.setState('code_challenge', codeChallenge);
	}

	getCodeChallenge(): string | null {
		return this.getState('code_challenge');
	}

	removeCodeChallenge(): void {
		this.removeState('code_challenge');
	}

	// Clear all
	clear(): void {
		this.storage.removeItem(`${STORAGE_PREFIX}tokens`);
		this.storage.removeItem(`${STORAGE_PREFIX}token_issued_at`);
		this.storage.removeItem(`${STORAGE_PREFIX}user`);
		this.removeState('oauth_state');
		this.removeCodeVerifier();
		this.removeCodeChallenge();
	}

	// Validation
	hasValidToken(): boolean {
		const tokens = this.getTokens();
		const issuedAt = this.getTokenIssuedAt();

		if (!tokens || !issuedAt) return false;

		const now = Date.now();
		const expirationTime = issuedAt + tokens.expiresIn * 1000;

		return now < expirationTime;
	}
}
