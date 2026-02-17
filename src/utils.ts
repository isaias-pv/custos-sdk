/**
 * Genera un string aleatorio para el parámetro state
 */
export function generateState(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Genera un code_verifier para PKCE
 * Debe tener entre 43 y 128 caracteres
 */
export function generateCodeVerifier(): string {
	const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
	const length = 128; // Usar longitud máxima para mayor seguridad
	const array = new Uint8Array(length);
	crypto.getRandomValues(array);
	
	return Array.from(array, byte => charset[byte % charset.length]).join('');
}

/**
 * Genera un code_challenge a partir del code_verifier usando SHA-256
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(codeVerifier);
	const digest = await crypto.subtle.digest('SHA-256', data);
	
	return base64UrlEncode(digest);
}

/**
 * Codifica un ArrayBuffer en base64url (sin padding)
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	
	return btoa(binary)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

/**
 * Parsea los query params de una URL
 */
export function parseQueryString(url: string): Record<string, string> {
	const params: Record<string, string> = {};
	
	try {
		const urlObj = new URL(url);
		urlObj.searchParams.forEach((value, key) => {
			params[key] = value;
		});
		
		// También chequear hash params (para implicit flow)
		if (urlObj.hash) {
			const hashParams = new URLSearchParams(urlObj.hash.substring(1));
			hashParams.forEach((value, key) => {
				params[key] = value;
			});
		}
	} catch (error) {
		// Fallback: parsear manualmente
		const queryStart = url.indexOf('?');
		if (queryStart !== -1) {
			const queryString = url.substring(queryStart + 1);
			const pairs = queryString.split('&');
			
			for (const pair of pairs) {
				const [key, value] = pair.split('=');
				if (key) {
					params[decodeURIComponent(key)] = decodeURIComponent(value || '');
				}
			}
		}
	}
	
	return params;
}

/**
 * Normaliza el scope a un formato consistente
 */
export function normalizeScope(scope?: string | string[]): string {
	if (!scope) return 'openid profile';
	
	if (Array.isArray(scope)) {
		return scope.join(' ');
	}
	
	return scope;
}

/**
 * Valida si una URL es válida
 */
export function isValidUrl(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

/**
 * Remueve los trailing slashes de una URL
 */
export function normalizeUrl(url: string): string {
	return url.replace(/\/+$/, '');
}

/**
 * Valida si un token JWT está expirado (sin verificar firma)
 */
export function isTokenExpired(token: string): boolean {
	try {
		const parts = token.split('.');
		if (parts.length !== 3) return true;
		
		const payload = JSON.parse(atob(parts[1]));
		const exp = payload.exp;
		
		if (!exp) return false;
		
		return Date.now() >= exp * 1000;
	} catch {
		return true;
	}
}

/**
 * Decodifica un token JWT (sin verificar firma)
 */
export function decodeToken(token: string): any {
	try {
		const parts = token.split('.');
		if (parts.length !== 3) return null;
		
		return JSON.parse(atob(parts[1]));
	} catch {
		return null;
	}
}
