import { CustosConfig, User, AuthState, AuthEvent, AuthEventType } from './types';
import { Storage } from './storage';
import { ApiClient } from './api';
import { generateState, parseQueryString, isTokenExpired } from './utils';

export class Custos {
	private config: Required<CustosConfig>;
	private storage: Storage;
	private api: ApiClient;
	private listeners: Map<AuthEventType, Set<(event: AuthEvent) => void>>;
	private tokenIssuedAt: number | null = null;

	constructor(config: CustosConfig) {
		this.config = {
			clientId: config.clientId,
			clientSecret: config.clientSecret || '',
			redirectUri: config.redirectUri,
			apiUrl: config.apiUrl || 'https://custos.alimzen.com',
			scope: config.scope || ['openid', 'profile', 'email'],
		};

		this.storage = new Storage();
		this.api = new ApiClient(this.config.apiUrl);
		this.listeners = new Map();

		// Handle callback automatically
		this.handleCallback();

		// Setup token refresh
		this.setupTokenRefresh();
	}

	// Authentication Methods
	async login(): Promise<void> {
		const state = generateState();
		this.storage.setState('oauth_state', state);

		const params = new URLSearchParams({
			response_type: 'code',
			client_id: this.config.clientId,
			redirect_uri: this.config.redirectUri,
			scope: this.config.scope.join(' '),
			state,
		});

		window.location.href = `${this.config.apiUrl}/oauth/authorize?${params}`;
	}

	async logout(): Promise<void> {
		const tokens = this.storage.getTokens();

		if (tokens?.accessToken) {
			try {
				await this.api.logout(tokens.accessToken);
			} catch (error) {
				console.error('Logout error:', error);
			}
		}

		this.storage.clear();
		this.emit('logout', null);
	}

	async handleCallback(): Promise<void> {
		const params = parseQueryString(window.location.href);
		const code = params.code;
		const state = params.state;

		if (!code) return;

		const savedState = this.storage.getState('oauth_state');
		if (state !== savedState) {
			throw new Error('Invalid state parameter');
		}

		this.storage.removeState('oauth_state');

		try {
			const tokens = await this.api.exchangeCodeForTokens(
				code,
				this.config.clientId,
				this.config.redirectUri,
				this.config.clientSecret
			);

			this.tokenIssuedAt = Date.now();
			this.storage.setTokens(tokens);

			const user = await this.api.getUserInfo(tokens.accessToken);
			this.storage.setUser(user);

			this.emit('login', { user, tokens });

			// Clean URL
			window.history.replaceState({}, document.title, window.location.pathname);
		} catch (error) {
			this.emit('error', error);
			throw error;
		}
	}

	// User Methods
	getUser(): User | null {
		return this.storage.getUser();
	}

	getAccessToken(): string | null {
		return this.storage.getTokens()?.accessToken || null;
	}

	isAuthenticated(): boolean {
		return !!this.storage.getTokens() && !!this.storage.getUser();
	}

	getState(): AuthState {
		return {
			isAuthenticated: this.isAuthenticated(),
			user: this.getUser(),
			tokens: this.storage.getTokens(),
		};
	}

	// Token Refresh
	private setupTokenRefresh(): void {
		setInterval(async () => {
			if (this.shouldRefreshToken()) {
				await this.refreshToken();
			}
		}, 60000); // Check every minute
	}

	private shouldRefreshToken(): boolean {
		const tokens = this.storage.getTokens();
		if (!tokens || !this.tokenIssuedAt) return false;

		return isTokenExpired(tokens.expiresIn, this.tokenIssuedAt);
	}

	async refreshToken(): Promise<void> {
		const tokens = this.storage.getTokens();
		if (!tokens?.refreshToken) {
			throw new Error('No refresh token available');
		}

		try {
			const newTokens = await this.api.refreshAccessToken(
				tokens.refreshToken,
				this.config.clientId,
				this.config.clientSecret
			);

			this.tokenIssuedAt = Date.now();
			this.storage.setTokens(newTokens);

			this.emit('token-refresh', newTokens);
		} catch (error) {
			this.emit('error', error);
			// If refresh fails, logout
			await this.logout();
			throw error;
		}
	}

	// Event Handling
	on(event: AuthEventType, callback: (event: AuthEvent) => void): void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(callback);
	}

	off(event: AuthEventType, callback: (event: AuthEvent) => void): void {
		this.listeners.get(event)?.delete(callback);
	}

	private emit(type: AuthEventType, data?: any): void {
		const event: AuthEvent = { type, data };
		this.listeners.get(type)?.forEach((callback) => callback(event));
	}
}