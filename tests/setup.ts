import { TextEncoder, TextDecoder } from 'util';
import { webcrypto } from 'crypto';

// Polyfill TextEncoder/TextDecoder for jsdom test environment
if (typeof global.TextEncoder === 'undefined') {
	(global as any).TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
	(global as any).TextDecoder = TextDecoder;
}

// Polyfill crypto.subtle for jsdom — jsdom wraps window.crypto but omits SubtleCrypto.
// Override unconditionally so utils.ts can use crypto.subtle.digest()
Object.defineProperty(global, 'crypto', {
	value: webcrypto,
	writable: true,
	configurable: true,
});
