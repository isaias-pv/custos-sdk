export type CustosAuthErrorCode =
  /** No `Authorization: Bearer ...` header. */
  | 'missing_token'
  /** Bad signature, issuer, audience, algorithm or format. */
  | 'invalid_token'
  | 'token_expired'
  /** The session behind the token was closed or revoked (only with introspection). */
  | 'inactive_token'
  /** Valid token, but without the required permissions or roles. */
  | 'insufficient_permissions'
  /** Custos could not be reached to fetch keys or introspect. */
  | 'server_unavailable';

const BRAND = Symbol.for('@alimzen/custos-node:error');

export class CustosAuthError extends Error {
  readonly code: CustosAuthErrorCode;
  /** HTTP status to answer with: 401, 403 or 503. */
  readonly status: number;

  constructor(code: CustosAuthErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'CustosAuthError';
    this.code = code;
    this.status = code === 'insufficient_permissions' ? 403 : code === 'server_unavailable' ? 503 : 401;
    Object.defineProperty(this, BRAND, { value: true });
  }

  /** Body for the HTTP answer, in the shape of RFC 6750. */
  toJSON(): { error: string; error_description: string } {
    const error = this.code === 'insufficient_permissions' ? 'insufficient_scope' : this.status === 503 ? 'temporarily_unavailable' : 'invalid_token';
    return { error, error_description: this.message };
  }

  static override [Symbol.hasInstance](value: unknown): boolean {
    if (Function.prototype[Symbol.hasInstance].call(this, value)) return true;
    return typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[BRAND] === true;
  }
}
