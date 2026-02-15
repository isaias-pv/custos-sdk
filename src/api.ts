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
		clientSecret?: string
	): Promise<AuthTokens> {
		const response = await fetch(`${this.baseUrl}/oauth/token`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				grant_type: 'authorization_code',
				code,
				client_id: clientId,
				client_secret: clientSecret,
				redirect_uri: redirectUri,
			}),
		});

		if (!response.ok) {
			throw new Error('Failed to exchange code for tokens');
		}

		const data = await response.json();
		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresIn: data.expires_in,
			tokenType: data.token_type,
		};
	}

	async getUserInfo(accessToken: string): Promise<User> {
		const response = await fetch(`${this.baseUrl}/oauth/userinfo`, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!response.ok) {
			throw new Error('Failed to get user info');
		}

		return response.json();
	}

	async refreshAccessToken(
		refreshToken: string,
		clientId: string,
		clientSecret?: string
	): Promise<AuthTokens> {
		const response = await fetch(`${this.baseUrl}/oauth/token`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				grant_type: 'refresh_token',
				refresh_token: refreshToken,
				client_id: clientId,
				client_secret: clientSecret,
			}),
		});

		if (!response.ok) {
			throw new Error('Failed to refresh token');
		}

		const data = await response.json();
		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresIn: data.expires_in,
			tokenType: data.token_type,
		};
	}

	async logout(accessToken: string): Promise<void> {
		await fetch(`${this.baseUrl}/oauth/revoke`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});
	}
}