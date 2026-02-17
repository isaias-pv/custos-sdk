import { AuthTokens, User, TokenResponse, UserInfoResponse } from './types';
import { normalizeUrl } from './utils';

export class ApiClient {
	private baseUrl: string;

	constructor(baseUrl: string) {
		this.baseUrl = normalizeUrl(baseUrl);
	}

	/**
	 * Intercambia el código de autorización por tokens de acceso
	 */
	async exchangeCodeForTokens(
		code: string,
		clientId: string,
		redirectUri: string,
		codeVerifier?: string,
		clientSecret?: string
	): Promise<AuthTokens> {
		const body: Record<string, string> = {
			grant_type: 'authorization_code',
			code,
			client_id: clientId,
			redirect_uri: redirectUri,
		};

		if (codeVerifier) {
			body.code_verifier = codeVerifier;
		}

		if (clientSecret) {
			body.client_secret = clientSecret;
		}

		const response = await this.request<TokenResponse>('/api/v1/auth/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams(body),
		});

		return this.normalizeTokens(response.data);
	}

	/**
	 * Refresca el access token usando el refresh token
	 */
	async refreshAccessToken(
		refreshToken: string,
		clientId: string,
		clientSecret?: string
	): Promise<AuthTokens> {
		const body: Record<string, string> = {
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
			client_id: clientId,
		};

		if (clientSecret) {
			body.client_secret = clientSecret;
		}

		const response = await this.request<TokenResponse>('/api/v1/auth/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams(body),
		});

		return this.normalizeTokens(response.data);
	}

	/**
	 * Obtiene la información del usuario autenticado
	 */
	async getUserInfo(accessToken: string): Promise<User> {
		const response = await this.request<UserInfoResponse>('/api/v1/system/users/profile', {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
			},
		});

		return response.data;
	}

	/**
	 * Valida si un token es válido
	 */
	async validateToken(accessToken: string): Promise<boolean> {
		try {
			await this.request('/api/v1/auth/validate', {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${accessToken}`,
				},
			});
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Cierra la sesión del usuario
	 */
	async logout(accessToken: string): Promise<void> {
		try {
			await this.request('/api/v1/auth/logout', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': 'application/json',
				},
			});
		} catch (error) {
			// Ignorar errores de logout
			console.warn('Logout request failed:', error);
		}
	}

	/**
	 * Revoca un token (access o refresh)
	 */
	async revokeToken(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<void> {
		const body: Record<string, string> = {
			token,
		};

		if (tokenTypeHint) {
			body.token_type_hint = tokenTypeHint;
		}

		await this.request('/api/v1/auth/revoke', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams(body),
		});
	}

	// ==================== Private Methods ====================

	private async request<T = any>(
		endpoint: string,
		options: RequestInit & { body?: URLSearchParams | FormData | string }
	): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		
		const requestOptions: RequestInit = {
			...options,
			body: options.body instanceof URLSearchParams || options.body instanceof FormData
				? options.body
				: typeof options.body === 'string'
				? options.body
				: JSON.stringify(options.body),
		};

		console.log(`📡 API Request: ${options.method} ${url}`);

		try {
			const response = await fetch(url, requestOptions);
			
			console.log(`📡 API Response: ${response.status} ${response.statusText}`);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({
					error: 'unknown_error',
					error_description: response.statusText,
				}));

				throw new Error(errorData.error_description || errorData.message || response.statusText);
			}

			const data = await response.json();
			return data;
		} catch (error) {
			console.error(`❌ API Error: ${endpoint}`, error);
			throw error;
		}
	}

	private normalizeTokens(data: any): AuthTokens {
		return {
			accessToken: data.access_token || data.accessToken,
			refreshToken: data.refresh_token || data.refreshToken,
			tokenType: data.token_type || data.tokenType || 'Bearer',
			expiresIn: data.expires_in || data.expiresIn || 3600,
			scope: data.scope,
		};
	}
}
