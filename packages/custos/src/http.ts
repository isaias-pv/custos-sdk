import { CustosError } from './errors.js';
import type { TokenSet } from './types.js';
import { decodeJwt } from './encoding.js';

const OAUTH_ERRORS = new Set([
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
  'access_denied',
  'unsupported_response_type',
  'server_error',
  'temporarily_unavailable',
  'login_required',
  'consent_required',
  'interaction_required',
  'invalid_token',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Custos wraps most JSON answers as `{ code, message, data }`; standard OAuth endpoints answer bare.
 * Both shapes are accepted.
 */
export function unwrap(body: unknown): unknown {
  if (isRecord(body) && 'data' in body && 'code' in body && 'message' in body) return body.data;
  return body;
}

function describeError(body: unknown, fallback: string): { message: string; oauthError?: string } {
  const source = isRecord(body) ? body : {};
  const nested = isRecord(source.data) ? source.data : {};
  const error = [source.error, nested.error].find((e): e is string => typeof e === 'string');
  const candidates = [source.error_description, nested.error_description, source.message, nested.message];
  let message = candidates.find((m): m is string => typeof m === 'string' && m.length > 0);
  if (!message) {
    const list = candidates.find((m): m is string[] => Array.isArray(m));
    message = list?.join(', ');
  }
  const oauthError = error && OAUTH_ERRORS.has(error) ? error : undefined;
  return { message: message ?? error ?? fallback, ...(oauthError ? { oauthError } : {}) };
}

export async function requestJson(fetchFn: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, { ...init, headers: { Accept: 'application/json', ...init.headers } });
  } catch (cause) {
    throw new CustosError('network_error', `Could not reach ${new URL(url).host}`, { cause });
  }

  const text = response.status === 204 ? '' : await response.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const { message, oauthError } = describeError(body, response.statusText || `HTTP ${response.status}`);
    throw new CustosError(oauthError ? 'oauth_error' : 'http_error', message, {
      status: response.status,
      ...(oauthError ? { oauthError } : {}),
    });
  }
  return unwrap(body);
}

export function form(params: Record<string, string | undefined>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) body.set(key, value);
  return body;
}

const DEFAULT_LIFETIME_SECONDS = 3600;

/** Normalizes a token response (snake_case or camelCase) into a `TokenSet` with an absolute expiry. */
export function toTokenSet(raw: unknown, now = Date.now()): TokenSet {
  const data = isRecord(raw) ? raw : {};
  const pick = (snake: string, camel: string): unknown => data[snake] ?? data[camel];

  const accessToken = pick('access_token', 'accessToken');
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new CustosError('http_error', 'The token response has no access_token');
  }

  // The token's own `exp` wins: it doesn't drift with the time the response spent in transit.
  const exp = decodeJwt<{ exp?: unknown }>(accessToken)?.exp;
  const expiresIn = Number(pick('expires_in', 'expiresIn'));
  const expiresAt =
    typeof exp === 'number'
      ? exp * 1000
      : now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : DEFAULT_LIFETIME_SECONDS) * 1000;

  const tokens: TokenSet = {
    accessToken,
    tokenType: typeof pick('token_type', 'tokenType') === 'string' ? (pick('token_type', 'tokenType') as string) : 'Bearer',
    expiresAt,
  };
  const refreshToken = pick('refresh_token', 'refreshToken');
  if (typeof refreshToken === 'string' && refreshToken) tokens.refreshToken = refreshToken;
  const idToken = pick('id_token', 'idToken');
  if (typeof idToken === 'string' && idToken) tokens.idToken = idToken;
  if (typeof data.scope === 'string') tokens.scope = data.scope;
  return tokens;
}
