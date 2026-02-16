import { AuthTokens, User } from './types';

const STORAGE_PREFIX = 'custos_';

export class Storage {
	private storage: globalThis.Storage;

	constructor(useSessionStorage = false) {
		this.storage = useSessionStorage ? sessionStorage : localStorage;
		console.log(`Using ${useSessionStorage ? 'sessionStorage' : 'localStorage'}`);
		console.log('Storage initialized:', this.storage);
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
		console.log(`Setting state: ${key} = ${value}`);
		console.log(`storage_prefix: ${STORAGE_PREFIX}${key}`)
		console.log(`Storage before setting state:`, this.storage);
		this.storage.setItem(`${STORAGE_PREFIX}${key}`, value);
	}

	getState(key: string): string | null {
		console.log(`Getting state: ${key}`, `${STORAGE_PREFIX}${key}`);
		console.log(`Storage before getting state:`, this.storage);
		return this.storage.getItem(`${STORAGE_PREFIX}${key}`);
	}

	removeState(key: string): void {
		console.log(`Removing state: ${key}`);
		this.storage.removeItem(`${STORAGE_PREFIX}${key}`);
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
