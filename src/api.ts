import { AuthTokens, User } from './types';

export class ApiClient {
	private baseUrl: string;

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl;
	}

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

		// Add PKCE code_verifier if present
		if (codeVerifier) {
			body.code_verifier = codeVerifier;
		}

		// Add client_secret if present (for confidential clients)
		if (clientSecret) {
			body.client_secret = clientSecret;
		}

		const response = await fetch(`${this.baseUrl}/api/v1/auth/token`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams(body).toString(),
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({
				error: 'unknown_error',
				error_description: 'Failed to exchange code for tokens'
			}));

			throw new Error(errorData.error_description || errorData.error || 'Token exchange failed');
		}

		const result = await response.json();
		const data = result.data || result; // Support both {data: {...}} and direct response

		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresIn: data.expires_in,
			tokenType: data.token_type || 'Bearer',
		};
	}

	async getUserInfo(accessToken: string): Promise<User> {
		const response = await fetch(`${this.baseUrl}/api/v1/auth/userinfo`, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!response.ok) {
			throw new Error('Failed to get user info');
		}

		const result = await response.json();
		return result.data || result;
	}

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

		const response = await fetch(`${this.baseUrl}/api/v1/auth/token`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams(body).toString(),
		});

		if (!response.ok) {
			throw new Error('Failed to refresh token');
		}

		const result = await response.json();
		const data = result.data || result;

		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token || refreshToken, // Keep old refresh token if not provided
			expiresIn: data.expires_in,
			tokenType: data.token_type || 'Bearer',
		};
	}

	async logout(accessToken: string): Promise<void> {
		await fetch(`${this.baseUrl}/api/v1/auth/revoke`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});
	}

	async validateToken(accessToken: string): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/api/v1/auth/validate`, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});
			return response.ok;
		} catch {
			return false;
		}
	}
}
