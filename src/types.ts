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
	grantType?: string;
}

export interface User {
	id: string;
	email: string;
	name?: string;
	picture?: string;
	roles?: string[];
	metadata?: Record<string, any>;
}

export interface AuthTokens {
	accessToken: string;
	refreshToken?: string;
	expiresIn: number;
	tokenType: string;
}

export interface AuthState {
	isAuthenticated: boolean;
	user: User | null;
	tokens: AuthTokens | null;
}

export type AuthEventType = 'login' | 'logout' | 'token-refresh' | 'token-expired' | 'error';

export interface AuthEvent {
	type: AuthEventType;
	data?: any;
}

export interface PKCETokens {
	code_verifier: string;
	code_challenge: string;
}
