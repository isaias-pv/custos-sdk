export type CustosErrorCode =
  /** The configuration passed to `new Custos()` is invalid. */
  | 'invalid_config'
  /** The URL has neither `code` nor `error`, or `code` came without `state`. */
  | 'invalid_callback'
  /** The callback's `state` doesn't match a login started in this browser (expired, reused or forged). */
  | 'invalid_state'
  /** The authorization server answered with an OAuth error (`error` / `error_description`). */
  | 'oauth_error'
  /** There is no session, or it can't be renewed: the user has to log in again. */
  | 'login_required'
  /** The request never got an answer (offline, DNS, CORS, ...). Retrying may work. */
  | 'network_error'
  /** The server answered with an unexpected HTTP status. */
  | 'http_error'
  /** A browser API the SDK needs (Web Crypto, `window`) is missing. */
  | 'unsupported_environment';

export interface CustosErrorOptions {
  status?: number;
  /** OAuth error code from the server (`invalid_grant`, `access_denied`, ...). */
  oauthError?: string;
  cause?: unknown;
}

/**
 * Marks Custos errors across copies of this package (ESM and CJS side by side, two versions...), where
 * `instanceof` on the class alone would fail.
 */
const BRAND = Symbol.for('@alimzen/custos:error');

export class CustosError extends Error {
  readonly code: CustosErrorCode;
  readonly status?: number;
  readonly oauthError?: string;

  constructor(code: CustosErrorCode, message: string, options: CustosErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'CustosError';
    this.code = code;
    if (options.status !== undefined) this.status = options.status;
    if (options.oauthError !== undefined) this.oauthError = options.oauthError;
    Object.defineProperty(this, BRAND, { value: true });
  }

  /** Whether trying the same operation again may succeed. */
  get retryable(): boolean {
    return this.code === 'network_error' || (this.status !== undefined && this.status >= 500);
  }

  static override [Symbol.hasInstance](value: unknown): boolean {
    if (Function.prototype[Symbol.hasInstance].call(this, value)) return true;
    return typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[BRAND] === true;
  }
}
