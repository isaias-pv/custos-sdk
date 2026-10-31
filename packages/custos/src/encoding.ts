import { CustosError } from './errors.js';

function getCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.getRandomValues || !c.subtle) {
    throw new CustosError('unsupported_environment', 'Web Crypto is not available (it needs a secure context: https or localhost)');
  }
  return c;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Random URL-safe string: `bytes` of entropy, base64url-encoded (no modulo bias). */
export function randomString(bytes = 32): string {
  return base64UrlEncode(getCrypto().getRandomValues(new Uint8Array(bytes)));
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** PKCE pair (RFC 7636) with the S256 method: a 43-character verifier and its SHA-256 challenge. */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = randomString(32);
  const digest = await getCrypto().subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)) };
}

/**
 * Reads the claims of a JWT **without verifying its signature**. Fine for showing data in the UI;
 * never use it to make authorization decisions (use `@alimzen/custos-node` on the server for that).
 */
export function decodeJwt<T = Record<string, unknown>>(token: string): T | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    return parsed !== null && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
}
