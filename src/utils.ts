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