import type { CustosError } from './errors.js';

/** Minimal subset of the Web Storage API; any object with these three methods works. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CustosEndpoints {
  /** Browser redirect that starts the login. */
  authorize: string;
  /** Code exchange and refresh (`grant_type=authorization_code | refresh_token`). */
  token: string;
  /** OIDC user claims. Set to `false` to build the user from the access token alone. */
  userinfo: string | false;
  /** Token revocation (RFC 7009). */
  revoke: string;
  /** Ends the server-side session of the access token. */
  logout: string;
}

export interface CustosConfig {
  /** `client_id` of the application registered in Custos. */
  clientId: string;
  /** Where Custos sends the user back after login. Must be registered for the application. */
  redirectUri: string;
  /** Base URL of the Custos server. Default: `https://custos.alimzen.com`. */
  issuer?: string;
  /** Default: `openid profile email`. */
  scope?: string | readonly string[];
  /**
   * Where the session (tokens and user) lives. Default: `local`, shared by every tab.
   * `memory` loses the session on reload; the login itself still works because the PKCE
   * transaction always goes to `sessionStorage`.
   */
  storage?: 'local' | 'session' | 'memory' | StorageLike;
  /** Prefix for storage keys and the cross-tab channel. Default: `custos`. */
  storagePrefix?: string;
  /** Renew the access token before it expires. Default: `true`. */
  autoRefresh?: boolean;
  /** Seconds before expiry at which the token counts as expired and gets renewed. Default: `60`. */
  refreshLeeway?: number;
  /** Mirror login, logout and refresh across tabs of the same origin. Default: `true`. */
  syncTabs?: boolean;
  /** Paths (relative to `issuer`) or absolute URLs; only the ones given replace the defaults. */
  endpoints?: Partial<CustosEndpoints>;
  /** Custom `fetch` (tests, SSR, instrumentation). Default: the global one. */
  fetch?: typeof fetch;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  tokenType: string;
  scope?: string;
  /** Expiry of the access token, in epoch milliseconds. */
  expiresAt: number;
}

export interface CustosUser {
  /** Subject: the user id in Custos. */
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  username?: string;
  picture?: string;
  tenantId?: string;
  tenantSlug?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
  /** Every claim as received, for anything not mapped above. */
  claims: Record<string, unknown>;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: CustosUser | null;
  tokens: TokenSet | null;
  expiresAt: Date | null;
}

export interface LoginOptions {
  /** Any serializable value; `handleCallback()` returns it after the redirect (e.g. `{ returnTo: '/billing' }`). */
  appState?: unknown;
  /** Pre-fills the email on the login screen. */
  loginHint?: string;
  prompt?: 'login' | 'consent' | 'select_account' | 'none';
  /** Extra query parameters for the authorize endpoint. */
  params?: Record<string, string>;
}

export interface LogoutOptions {
  /** Also revoke the refresh token on the server. Default: `true`. */
  revoke?: boolean;
  /** Absolute URL or path to navigate to once the session is cleared. */
  returnTo?: string;
}

export interface CallbackResult {
  user: CustosUser;
  tokens: TokenSet;
  appState?: unknown;
}

export type LogoutReason = 'user' | 'expired' | 'remote';

export interface CustosEventMap {
  login: CallbackResult;
  logout: { reason: LogoutReason };
  refresh: { tokens: TokenSet };
  error: CustosError;
  /** Any change of the auth state, including those caused by other tabs. */
  change: AuthState;
}

export type CustosEvent = keyof CustosEventMap;
