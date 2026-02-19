import { CustosConfig, User, AuthState, AuthEvent, AuthEventType } from './types';
import { Storage } from './storage';
import { ApiClient } from './api';
import {
	generateState,
	parseQueryString,
	generateCodeVerifier,
	generateCodeChallenge,
	normalizeScope
} from './utils';

export class Custos {
	private config: Required<CustosConfig>;
	private storage: Storage;
	private api: ApiClient;
	private listeners: Map<AuthEventType, Set<(event: AuthEvent) => void>>;
	private tokenExpiryTimer: any = null;

	constructor(config: CustosConfig) {
		// Normalize scope
		const scope = normalizeScope(config.scope);

		this.config = {
			clientId: config.clientId,
			clientSecret: config.clientSecret || '',
			redirectUri: config.redirectUri,
			apiUrl: config.apiUrl || 'https://custos.alimzen.com',
			scope,
			responseType: config.responseType || 'code',
			state: config.state || generateState(),
			usePKCE: config.usePKCE !== false, // Default to true
			codeChallengeMethod: config.codeChallengeMethod || 'S256',
			grantType: config.grantType || 'authorization_code',
			useSessionStorage: config.useSessionStorage || false // Default to localStorage
		};

		// 🔥 FIX: Siempre usar localStorage para state y PKCE
		// sessionStorage se pierde entre tabs/ventanas/recargas en apps nativas
		this.storage = new Storage(false); // Siempre localStorage
		this.api = new ApiClient(this.config.apiUrl);
		this.listeners = new Map();

		// 🔥 FIX: NO auto-manejar callback en constructor
		// El callback debe ser manejado explícitamente por el desarrollador
		// cuando ellos decidan (por ejemplo, en ngOnInit después de que el componente esté listo)
		if (typeof window !== 'undefined') {
			this.setupTokenExpiryMonitoring();
		}
	}

	// ==================== Authentication Methods ====================

	/**
	 * Inicia el flujo de autenticación OAuth 2.0 con PKCE
	 * @param additionalParams Parámetros adicionales para la URL de autorización
	 */
	async login(additionalParams?: Record<string, string>): Promise<void> {
		const state = this.config.state;
		
		this.storage.setState('oauth_state', state);

		const params: Record<string, string> = {
			response_type: this.config.responseType,
			client_id: this.config.clientId,
			redirect_uri: this.config.redirectUri,
			scope: Array.isArray(this.config.scope) ? this.config.scope.join(' ') : this.config.scope,
			state,
			...additionalParams,
		};

		// Add PKCE if enabled
		if (this.config.usePKCE) {
			const codeVerifier = generateCodeVerifier();
			const codeChallenge = await generateCodeChallenge(codeVerifier);
			
			this.storage.setCodeVerifier(codeVerifier);
			this.storage.setCodeChallenge(codeChallenge);

			params.code_challenge = codeChallenge;
			params.code_challenge_method = this.config.codeChallengeMethod;
		}

		const authUrl = `${this.config.apiUrl}/v1/auth/authorize?${new URLSearchParams(params)}`;
		
		window.location.href = authUrl;
	}

	/**
	 * 🔥 NUEVO: Maneja el callback de OAuth explícitamente
	 * Debe ser llamado por el desarrollador cuando detecten el código en la URL
	 */
	async handleCallback(): Promise<void> {
		const params = parseQueryString(window.location.href);
		// Check for errors
		const error = params.error;
		if (error) {
			const errorDescription = params.error_description || error;
			this.emit('error', { error, error_description: errorDescription });
			throw new Error(errorDescription);
		}

		// Check for authorization code
		const code = params.code;
		if (!code) {
			return;
		}

		// Validate state
		const state = params.state;
		const savedState = this.storage.getState('oauth_state');

		// 🔥 FIX: Manejar el caso donde no hay savedState
		if (!savedState) {
			// Emitir error pero con información útil
			const errorMsg = 'No saved state found. Authentication session may have expired.';
			this.emit('error', { 
				error: 'state_not_found', 
				error_description: errorMsg,
				message: errorMsg
			});
			throw new Error(errorMsg);
		}

		if (state !== savedState) {
			this.emit('error', { 
				error: 'invalid_state', 
				error_description: 'State parameter mismatch' 
			});
			throw new Error('Invalid state parameter');
		}

		// Limpiar state usado
		this.storage.removeState('oauth_state');

		try {
			// Get code_verifier if using PKCE
			const codeVerifier = this.config.usePKCE ? this.storage.getCodeVerifier() || undefined : undefined;
			
			if (this.config.usePKCE && !codeVerifier) {
				const errorMsg = 'Code verifier not found. Authentication cannot continue.';
				this.emit('error', {
					error: 'code_verifier_not_found',
					error_description: errorMsg,
					message: errorMsg
				});
				throw new Error(errorMsg);
			}

			// Exchange code for tokens
			const tokens = await this.api.exchangeCodeForTokens(
				code,
				this.config.clientId,
				this.config.redirectUri,
				codeVerifier,
				this.config.clientSecret
			);

			this.storage.setTokens(tokens);

			// Get user info
			const user = await this.api.getUserInfo(tokens.accessToken);
			
			this.storage.setUser(user);

			// Clean up PKCE data
			if (this.config.usePKCE) {
				this.storage.removeCodeVerifier();
				this.storage.removeCodeChallenge();
			}

			// Setup token expiry monitoring
			this.setupTokenExpiryMonitoring();

			this.emit('login', { user, tokens });

			// Clean URL (remove query params)
			if (typeof window !== 'undefined' && window.history) {
				window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
			}
		} catch (error) {
			this.emit('error', error);
			throw error;
		}
	}

	async logout(): Promise<void> {
		const tokens = this.storage.getTokens();

		if (tokens?.accessToken) {
			try {
				await this.api.logout(tokens.accessToken);
			} catch (error) {
				this.emit('error', error);
				throw error;
			}
		}

		this.clearTokenExpiryTimer();
		this.storage.clear();
		this.emit('logout', null);
	}

	// ==================== User Methods ====================

	getUser(): User | null {
		return this.storage.getUser();
	}

	getAccessToken(): string | null {
		return this.storage.getTokens()?.accessToken || null;
	}

	getRefreshToken(): string | null {
		return this.storage.getTokens()?.refreshToken || null;
	}

	isAuthenticated(): boolean {
		return this.storage.hasValidToken() && !!this.storage.getUser();
	}

	getState(): AuthState {
		return {
			isAuthenticated: this.isAuthenticated(),
			user: this.getUser(),
			tokens: this.storage.getTokens(),
		};
	}

	async validateToken(): Promise<boolean> {
		const accessToken = this.getAccessToken();
		if (!accessToken) return false;

		try {
			return await this.api.validateToken(accessToken);
		} catch {
			return false;
		}
	}

	// ==================== Token Refresh ====================

	private setupTokenExpiryMonitoring(): void {
		this.clearTokenExpiryTimer();

		const tokens = this.storage.getTokens();
		const issuedAt = this.storage.getTokenIssuedAt();

		if (!tokens || !issuedAt) return;

		// Refresh 5 minutes before expiry
		const timeUntilRefresh = (tokens.expiresIn - 300) * 1000; // 5 min buffer

		if (timeUntilRefresh > 0) {
			this.tokenExpiryTimer = setTimeout(async () => {
				try {
					await this.refreshToken();
				} catch (error) {
					this.emit('token-expired', error);
					await this.logout();
				}
			}, timeUntilRefresh);
		}
	}

	private clearTokenExpiryTimer(): void {
		if (this.tokenExpiryTimer) {
			clearTimeout(this.tokenExpiryTimer);
			this.tokenExpiryTimer = null;
		}
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

			this.storage.setTokens(newTokens);
			this.setupTokenExpiryMonitoring();
			this.emit('token-refresh', newTokens);
		} catch (error) {
			this.emit('error', error);
			throw error;
		}
	}

	// ==================== Event Handling ====================

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

	// ==================== Utility Methods ====================

	clearStorage(): void {
		this.storage.clear();
	}

	destroy(): void {
		this.clearTokenExpiryTimer();
		this.listeners.clear();
	}

	/**
	 * 🔥 NUEVO: Helper para verificar si hay un callback pendiente
	 * Útil para saber si debes llamar a handleCallback()
	 */
	hasCallbackParams(): boolean {
		if (typeof window === 'undefined') return false;
		
		const params = parseQueryString(window.location.href);
		return !!(params.code || params.error);
	}
}
