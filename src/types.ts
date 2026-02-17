// ==================== Configuration ====================

export interface CustosConfig {
	clientId: string;
	clientSecret?: string;
	redirectUri: string;
	apiUrl?: string;
	scope?: string | string[];
	responseType?: 'code' | 'token';
	state?: string;
	usePKCE?: boolean;
	codeChallengeMethod?: 'S256' | 'plain';
	grantType?: 'authorization_code' | 'refresh_token' | 'client_credentials';
	useSessionStorage?: boolean;
}

// ==================== Auth Tokens ====================

export interface AuthTokens {
	accessToken: string;
	refreshToken?: string;
	tokenType: string;
	expiresIn: number;
	scope?: string;
}

// ==================== User ====================

export interface User {
	id: string;
	email: string;
	name?: string;
	picture?: string;
	emailVerified?: boolean;
	[key: string]: any;
}

// ==================== Auth State ====================

export interface AuthState {
	isAuthenticated: boolean;
	user: User | null;
	tokens: AuthTokens | null;
}

// ==================== Events ====================

export type AuthEventType =
	| 'login'
	| 'logout'
	| 'error'
	| 'token-refresh'
	| 'token-expired';

export interface AuthEvent {
	type: AuthEventType;
	data?: any;
}

// ==================== API Responses ====================

export interface TokenResponse {
	data: {
		access_token: string;
		refresh_token?: string;
		token_type: string;
		expires_in: number;
		scope?: string;
	};
}

export interface UserInfoResponse {
	data: User;
}

export interface ErrorResponse {
	error: string;
	error_description?: string;
	message?: string;
}
