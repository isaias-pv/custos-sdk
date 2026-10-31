import { CustosAuthError } from './errors.js';

export interface IntrospectionOptions {
  issuer: string;
  /** Credentials of a confidential application registered in Custos. */
  clientId: string;
  clientSecret: string;
  /** Default: `${issuer}/api/v1/auth/introspect`. */
  endpoint?: string;
  /** Seconds an answer is reused for the same token. Default: 30; 0 disables the cache. */
  cacheTtl?: number;
  fetch?: typeof fetch;
}

export interface IntrospectionResult {
  active: boolean;
  sub?: string;
  client_id?: string;
  exp?: number;
  sid?: string;
  [claim: string]: unknown;
}

export interface Introspector {
  introspect(token: string): Promise<IntrospectionResult>;
  isActive(token: string): Promise<boolean>;
}

const MAX_CACHE_ENTRIES = 10_000;

export function createIntrospector(options: IntrospectionOptions): Introspector {
  const endpoint = options.endpoint ?? `${options.issuer.replace(/\/+$/, '')}/api/v1/auth/introspect`;
  const ttlMs = (options.cacheTtl ?? 30) * 1000;
  const cache = new Map<string, { result: IntrospectionResult; until: number }>();
  const basic = Buffer.from(
    `${encodeURIComponent(options.clientId)}:${encodeURIComponent(options.clientSecret)}`,
  ).toString('base64');

  async function introspect(token: string): Promise<IntrospectionResult> {
    const cached = cache.get(token);
    if (cached && cached.until > Date.now()) return cached.result;

    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({ token }),
      });
    } catch (cause) {
      throw new CustosAuthError('server_unavailable', 'Could not reach the introspection endpoint', { cause });
    }
    if (!response.ok) {
      throw new CustosAuthError(
        'server_unavailable',
        response.status === 401 ? 'Custos rejected the introspection credentials' : `Introspection failed (HTTP ${response.status})`,
      );
    }
    const body = (await response.json()) as Record<string, unknown>;
    // Custos may wrap answers as { code, message, data }.
    const result = ('data' in body && 'code' in body ? body.data : body) as IntrospectionResult;

    if (ttlMs > 0) {
      if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
      const expiry = typeof result.exp === 'number' ? result.exp * 1000 : Infinity;
      cache.set(token, { result, until: Math.min(Date.now() + ttlMs, expiry) });
    }
    return result;
  }

  return {
    introspect,
    async isActive(token) {
      return (await introspect(token)).active === true;
    },
  };
}
