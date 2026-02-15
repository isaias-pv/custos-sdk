export function generateState(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function parseQueryString(url: string): Record<string, string> {
	const params: Record<string, string> = {};
	const searchParams = new URL(url).searchParams;
	searchParams.forEach((value, key) => {
		params[key] = value;
	});
	return params;
}

export function isTokenExpired(expiresIn: number, issuedAt: number): boolean {
	const now = Date.now();
	const expirationTime = issuedAt + expiresIn * 1000;
	// Refresh 5 minutes before expiration
	return now >= expirationTime - 5 * 60 * 1000;
}

// PKCE utilities
export function generateCodeVerifier(): string {
	const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
	const length = Math.floor(Math.random() * 86) + 43; // 43-128 characters
	let verifier = '';
	for (let i = 0; i < length; i++) {
		verifier += charset.charAt(Math.floor(Math.random() * charset.length));
	}
	return verifier;
}

export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(codeVerifier);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return base64UrlEncode(digest);
}

function base64UrlEncode(digest: ArrayBuffer): string {
	const bytes = new Uint8Array(digest);
	const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
	return btoa(binary)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

export function normalizeScope(scope?: string | string[]): string[] {
	if (!scope) return ['openid', 'profile', 'email'];
	if (Array.isArray(scope)) return scope;
	if (typeof scope === 'string') return scope.split(' ');
	return ['openid', 'profile', 'email'];
}
