import { AuthTokens, User } from './types';

const STORAGE_PREFIX = 'custos_';

export class Storage {
	private storage: globalThis.Storage;

	constructor(useSessionStorage = false) {
		this.storage = useSessionStorage ? sessionStorage : localStorage;
	}

	setTokens(tokens: AuthTokens): void {
		this.storage.setItem(`${STORAGE_PREFIX}tokens`, JSON.stringify(tokens));
	}

	getTokens(): AuthTokens | null {
		const data = this.storage.getItem(`${STORAGE_PREFIX}tokens`);
		return data ? JSON.parse(data) : null;
	}

	setUser(user: User): void {
		this.storage.setItem(`${STORAGE_PREFIX}user`, JSON.stringify(user));
	}

	getUser(): User | null {
		const data = this.storage.getItem(`${STORAGE_PREFIX}user`);
		return data ? JSON.parse(data) : null;
	}

	clear(): void {
		this.storage.removeItem(`${STORAGE_PREFIX}tokens`);
		this.storage.removeItem(`${STORAGE_PREFIX}user`);
	}

	setState(key: string, value: string): void {
		this.storage.setItem(`${STORAGE_PREFIX}${key}`, value);
	}

	getState(key: string): string | null {
		return this.storage.getItem(`${STORAGE_PREFIX}${key}`);
	}

	removeState(key: string): void {
		this.storage.removeItem(`${STORAGE_PREFIX}${key}`);
	}
}