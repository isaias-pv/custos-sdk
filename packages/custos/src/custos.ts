import { CustosError } from './errors.js';
import { createPkcePair, decodeJwt, randomString } from './encoding.js';
import { form, requestJson, toTokenSet } from './http.js';
import { SessionStore, resolveStorage, type StoredSession } from './storage.js';
import type {
  AuthState,
  CallbackResult,
  CustosConfig,
  CustosEndpoints,
  CustosEvent,
  CustosEventMap,
  CustosUser,
  LoginOptions,
  LogoutOptions,
  LogoutReason,
  TokenSet,
} from './types.js';

export const DEFAULT_ISSUER = 'https://custos.alimzen.com';

export const DEFAULT_ENDPOINTS: CustosEndpoints = {
  authorize: '/v1/auth/authorize',
  token: '/api/v1/auth/token',
  userinfo: '/api/v1/auth/userinfo',
  revoke: '/api/v1/auth/revoke',
  logout: '/api/v1/auth/logout',
};

const CALLBACK_PARAMS = ['code', 'state', 'error', 'error_description', 'error_uri', 'iss', 'session_state'];
/** Wait before retrying a refresh that failed for network reasons. */
const RETRY_DELAY_MS = 30_000;
/** setTimeout overflows above 2^31-1 ms (~24.8 days). */
const MAX_TIMER_MS = 2 ** 31 - 1;

type Listener<K extends CustosEvent> = (payload: CustosEventMap[K]) => void;

function callbackParams(href: string): URLSearchParams {
  const url = new URL(href);
  const params = new URLSearchParams(url.search);
  // Hash routers (`/#/callback?code=...`) put the query inside the fragment.
  const query = url.hash.indexOf('?');
  if (query !== -1) {
    new URLSearchParams(url.hash.slice(query + 1)).forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  }
  return params;
}

function withoutCallbackParams(href: string): string {
  const url = new URL(href);
  for (const key of CALLBACK_PARAMS) url.searchParams.delete(key);
  const query = url.hash.indexOf('?');
  if (query !== -1) {
    const hashParams = new URLSearchParams(url.hash.slice(query + 1));
    for (const key of CALLBACK_PARAMS) hashParams.delete(key);
    const rest = hashParams.toString();
    url.hash = url.hash.slice(1, query) + (rest ? `?${rest}` : '');
  }
  return url.toString();
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** Builds the user from OIDC claims, accepting Custos' own claim names (`userId`, `firstName`...). */
export function userFromClaims(claims: Record<string, unknown>): CustosUser | null {
  const sub = str(claims.sub) ?? str(claims.userId) ?? str(claims.id);
  if (!sub) return null;
  const givenName = str(claims.given_name) ?? str(claims.firstName);
  const familyName = str(claims.family_name) ?? str(claims.lastName);
  const name = str(claims.name) ?? ([givenName, familyName].filter(Boolean).join(' ') || undefined);
  const verified = claims.email_verified ?? claims.isVerified;

  const user: CustosUser = { sub, claims };
  const fields: { [K in keyof CustosUser]?: CustosUser[K] | undefined } = {
    email: str(claims.email),
    emailVerified: typeof verified === 'boolean' ? verified : undefined,
    name,
    givenName,
    familyName,
    username: str(claims.preferred_username) ?? str(claims.username),
    picture: str(claims.picture) ?? str(claims.avatar),
    tenantId: str(claims.tenantId) ?? str(claims.tenant_id),
    tenantSlug: str(claims.tenantSlug),
    role: str(claims.role) ?? str(claims.tenantRole),
    roles: strings(claims.roles),
    permissions: strings(claims.permissions),
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) (user as unknown as Record<string, unknown>)[key] = value;
  }
  return user;
}

export class Custos {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly issuer: string;
  readonly scope: string;

  private readonly endpoints: CustosEndpoints;
  private readonly store: SessionStore;
  private readonly autoRefresh: boolean;
  private readonly leewayMs: number;
  private readonly lockName: string;
  private readonly fetchImpl: typeof fetch | undefined;

  private session: StoredSession | null;
  private listeners = new Map<CustosEvent, Set<Listener<CustosEvent>>>();
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private refreshing: Promise<TokenSet> | null = null;
  private detachStorageListener: (() => void) | undefined;

  constructor(config: CustosConfig) {
    if (!config?.clientId) throw new CustosError('invalid_config', 'clientId is required');
    if (!config.redirectUri) throw new CustosError('invalid_config', 'redirectUri is required');
    try {
      new URL(config.redirectUri);
      new URL(config.issuer ?? DEFAULT_ISSUER);
    } catch {
      throw new CustosError('invalid_config', 'redirectUri and issuer must be absolute URLs');
    }

    this.clientId = config.clientId;
    this.redirectUri = config.redirectUri;
    this.issuer = (config.issuer ?? DEFAULT_ISSUER).replace(/\/+$/, '');
    const scope = config.scope ?? 'openid profile email';
    this.scope = typeof scope === 'string' ? scope : scope.join(' ');
    this.endpoints = { ...DEFAULT_ENDPOINTS, ...config.endpoints };
    this.autoRefresh = config.autoRefresh ?? true;
    this.leewayMs = (config.refreshLeeway ?? 60) * 1000;
    this.fetchImpl = config.fetch;

    const prefix = config.storagePrefix ?? 'custos';
    this.lockName = `${prefix}.${this.clientId}.refresh`;
    this.store = new SessionStore(resolveStorage(config.storage), prefix, this.clientId);

    this.session = this.store.getSession();
    if (this.session && this.isExpired(this.session.tokens) && !this.session.tokens.refreshToken) {
      this.store.clearSession();
      this.session = null;
    }

    const shared = config.storage === undefined || config.storage === 'local';
    if ((config.syncTabs ?? true) && shared && typeof window !== 'undefined') {
      const onStorage = (event: StorageEvent) => {
        if (event.key === this.store.key || event.key === null) this.syncFromStorage();
      };
      window.addEventListener('storage', onStorage);
      this.detachStorageListener = () => window.removeEventListener('storage', onStorage);
    }

    this.scheduleRefresh();
  }

  // ==================== State ====================

  getState(): AuthState {
    const tokens = this.session?.tokens ?? null;
    return {
      isAuthenticated: this.isAuthenticated(),
      user: this.session?.user ?? null,
      tokens,
      expiresAt: tokens ? new Date(tokens.expiresAt) : null,
    };
  }

  /** There is a session with an access token that hasn't expired. */
  isAuthenticated(): boolean {
    return !!this.session && !this.isExpired(this.session.tokens, 0);
  }

  getUser(): CustosUser | null {
    return this.session?.user ?? null;
  }

  /** Current access token, or `null` if there is none or it has expired. Never triggers a refresh. */
  getAccessToken(): string | null {
    return this.isAuthenticated() ? this.session!.tokens.accessToken : null;
  }

  /** Access token renewed first if it's about to expire; `null` when the user has to log in again. */
  async getValidAccessToken(): Promise<string | null> {
    if (!this.session) return null;
    if (!this.isExpired(this.session.tokens)) return this.session.tokens.accessToken;
    if (!this.session.tokens.refreshToken) return this.getAccessToken();
    try {
      return (await this.refresh()).accessToken;
    } catch (error) {
      if (error instanceof CustosError && error.code === 'login_required') return null;
      // Network trouble: the current token may still be good for a few seconds.
      const token = this.getAccessToken();
      if (token) return token;
      throw error;
    }
  }

  // ==================== Login ====================

  /** Builds the authorize URL and saves the PKCE transaction, without navigating. */
  async buildAuthorizeUrl(options: LoginOptions = {}): Promise<string> {
    const { verifier, challenge } = await createPkcePair();
    const state = randomString(32);
    this.store.saveTransaction(state, {
      verifier,
      redirectUri: this.redirectUri,
      createdAt: Date.now(),
      ...(options.appState === undefined ? {} : { appState: options.appState }),
    });

    const params = new URLSearchParams({
      ...options.params,
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scope,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    if (options.loginHint) params.set('login_hint', options.loginHint);
    if (options.prompt) params.set('prompt', options.prompt);
    return `${this.url(this.endpoints.authorize)}?${params}`;
  }

  /** Sends the browser to the Custos login screen. */
  async login(options: LoginOptions = {}): Promise<void> {
    if (typeof window === 'undefined') {
      throw new CustosError('unsupported_environment', 'login() needs a browser; use buildAuthorizeUrl() elsewhere');
    }
    window.location.assign(await this.buildAuthorizeUrl(options));
  }

  /** The URL carries an OAuth answer (`code` + `state`, or `error`) for this SDK to handle. */
  hasCallbackParams(href: string = typeof window === 'undefined' ? '' : window.location.href): boolean {
    if (!href) return false;
    const params = callbackParams(href);
    return (params.has('code') && params.has('state')) || params.has('error');
  }

  /**
   * Finishes the login on the redirect URI: validates `state`, exchanges the code (PKCE), loads the
   * user and removes the OAuth parameters from the address bar.
   */
  async handleCallback(href: string = typeof window === 'undefined' ? '' : window.location.href): Promise<CallbackResult> {
    try {
      const result = await this.completeCallback(href);
      this.emit('login', result);
      this.emit('change', this.getState());
      return result;
    } catch (error) {
      const failure =
        error instanceof CustosError ? error : new CustosError('http_error', String(error), { cause: error });
      this.emit('error', failure);
      throw failure;
    } finally {
      if (typeof window !== 'undefined' && href === window.location.href && window.history?.replaceState) {
        window.history.replaceState(window.history.state, '', withoutCallbackParams(href));
      }
    }
  }

  private async completeCallback(href: string): Promise<CallbackResult> {
    if (!href) throw new CustosError('invalid_callback', 'There is no callback URL to handle');
    const params = callbackParams(href);
    const state = params.get('state');
    const tx = state ? this.store.takeTransaction(state) : null;

    const error = params.get('error');
    if (error) {
      throw new CustosError('oauth_error', params.get('error_description') || error, { oauthError: error });
    }
    const code = params.get('code');
    if (!code || !state) throw new CustosError('invalid_callback', 'The callback URL has no code and state');
    if (!tx) {
      throw new CustosError(
        'invalid_state',
        'This login was not started here or has expired (15 minutes); start it again',
      );
    }

    const raw = await requestJson(this.rawFetch, this.url(this.endpoints.token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId,
        redirect_uri: tx.redirectUri,
        code_verifier: tx.verifier,
      }),
    });
    const tokens = toTokenSet(raw);
    const user = await this.loadUser(tokens.accessToken);
    this.setSession({ tokens, user });
    return { user, tokens, ...(tx.appState === undefined ? {} : { appState: tx.appState }) };
  }

  private async loadUser(accessToken: string): Promise<CustosUser> {
    const tokenClaims = decodeJwt(accessToken) ?? {};
    let claims: Record<string, unknown> = tokenClaims;
    if (this.endpoints.userinfo !== false) {
      try {
        const info = await requestJson(this.rawFetch, this.url(this.endpoints.userinfo), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (info && typeof info === 'object') claims = { ...tokenClaims, ...(info as Record<string, unknown>) };
      } catch {
        // userinfo is a nicety: the access token already carries the identity.
      }
    }
    const user = userFromClaims(claims);
    if (!user) throw new CustosError('http_error', 'Neither userinfo nor the access token identify the user');
    return user;
  }

  // ==================== Session ====================

  /**
   * Call once at startup: keeps a valid session, renews one that expired if there's a refresh
   * token, and returns whether the user ended up logged in.
   */
  async restore(): Promise<boolean> {
    this.session = this.store.getSession();
    if (!this.session) return false;
    if (!this.isExpired(this.session.tokens)) {
      this.scheduleRefresh();
      return true;
    }
    try {
      await this.refresh();
      return true;
    } catch {
      return this.isAuthenticated();
    }
  }

  /** Renews the access token. Concurrent calls (also from other tabs) share one request. */
  refresh(): Promise<TokenSet> {
    this.refreshing ??= this.withLock(() => this.performRefresh()).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async withLock<T>(run: () => Promise<T>): Promise<T> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    return locks ? locks.request(this.lockName, run) : run();
  }

  private async performRefresh(): Promise<TokenSet> {
    const before = this.session;
    const latest = this.store.getSession();
    // Another tab renewed it while this one waited for the lock.
    if (latest && latest.tokens.accessToken !== before?.tokens.accessToken && !this.isExpired(latest.tokens)) {
      this.session = latest;
      this.scheduleRefresh();
      this.emit('change', this.getState());
      return latest.tokens;
    }

    const current = latest ?? before;
    const refreshToken = current?.tokens.refreshToken;
    if (!current || !refreshToken) {
      this.endSession('expired');
      throw new CustosError('login_required', 'There is no refresh token; log in again');
    }

    let raw: unknown;
    try {
      raw = await requestJson(this.rawFetch, this.url(this.endpoints.token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: this.clientId }),
      });
    } catch (error) {
      if (error instanceof CustosError && !error.retryable) {
        this.endSession('expired');
        throw new CustosError('login_required', 'The session expired; log in again', { cause: error });
      }
      throw error;
    }

    const tokens = toTokenSet(raw);
    // Servers that don't rotate refresh tokens leave it out of the answer.
    tokens.refreshToken ??= refreshToken;
    const claims = decodeJwt(tokens.accessToken);
    const user = (claims && userFromClaims({ ...current.user.claims, ...claims })) || current.user;
    this.setSession({ tokens, user });
    this.emit('refresh', { tokens });
    this.emit('change', this.getState());
    return tokens;
  }

  /** Ends the session on the server (best effort) and locally. */
  async logout(options: LogoutOptions = {}): Promise<void> {
    const session = this.session;
    if (session) {
      const calls: Promise<unknown>[] = [];
      if (!this.isExpired(session.tokens, 0)) {
        calls.push(
          requestJson(this.rawFetch, this.url(this.endpoints.logout), {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
          }),
        );
      }
      if (options.revoke !== false && session.tokens.refreshToken) {
        calls.push(
          requestJson(this.rawFetch, this.url(this.endpoints.revoke), {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form({
              token: session.tokens.refreshToken,
              token_type_hint: 'refresh_token',
              client_id: this.clientId,
            }),
          }),
        );
      }
      // A server that's down must not keep the user logged in on this device.
      await Promise.allSettled(calls);
    }
    this.endSession('user');
    if (options.returnTo && typeof window !== 'undefined') {
      window.location.assign(new URL(options.returnTo, window.location.href).toString());
    }
  }

  /**
   * `fetch` with the access token: renews it first if needed and, on a 401, renews and retries once.
   * The body must be re-sendable (string, FormData, URLSearchParams, Blob) for the retry to work.
   */
  async fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const token = await this.getValidAccessToken();
    if (!token) throw new CustosError('login_required', 'There is no session; log in first');

    const send = (accessToken: string) => {
      const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set('Authorization', `Bearer ${accessToken}`);
      return this.rawFetch(input, { ...init, headers });
    };

    const response = await send(token);
    if (response.status !== 401 || !this.session?.tokens.refreshToken) return response;
    const tokens = await this.refresh();
    return send(tokens.accessToken);
  }

  // ==================== Events ====================

  /** Subscribes to an event; returns the function that unsubscribes. */
  on<K extends CustosEvent>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(listener as Listener<CustosEvent>);
    return () => this.off(event, listener);
  }

  off<K extends CustosEvent>(event: K, listener: Listener<K>): void {
    this.listeners.get(event)?.delete(listener as Listener<CustosEvent>);
  }

  /** Calls `listener` with every change of the auth state. Returns the unsubscribe function. */
  subscribe(listener: (state: AuthState) => void): () => void {
    return this.on('change', listener);
  }

  /** Stops timers and listeners. The stored session is kept. */
  destroy(): void {
    clearTimeout(this.refreshTimer);
    this.detachStorageListener?.();
    this.listeners.clear();
  }

  // ==================== Internals ====================

  private emit<K extends CustosEvent>(event: K, payload: CustosEventMap[K]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      try {
        (listener as Listener<K>)(payload);
      } catch (error) {
        // A failing listener must not break the SDK or the other listeners.
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  private readonly rawFetch: typeof fetch = (input, init) => (this.fetchImpl ?? globalThis.fetch)(input, init);

  private url(endpoint: string): string {
    return /^https?:\/\//i.test(endpoint) ? endpoint : `${this.issuer}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  }

  private isExpired(tokens: TokenSet, leewayMs = this.leewayMs): boolean {
    return Date.now() >= tokens.expiresAt - leewayMs;
  }

  private setSession(session: StoredSession): void {
    this.session = session;
    this.store.setSession(session);
    this.scheduleRefresh();
  }

  private endSession(reason: LogoutReason): void {
    const hadSession = !!this.session;
    clearTimeout(this.refreshTimer);
    this.session = null;
    this.store.clearSession();
    if (hadSession) {
      this.emit('logout', { reason });
      this.emit('change', this.getState());
    }
  }

  private syncFromStorage(): void {
    const latest = this.store.getSession();
    if (!latest) {
      if (this.session) {
        clearTimeout(this.refreshTimer);
        this.session = null;
        this.emit('logout', { reason: 'remote' });
        this.emit('change', this.getState());
      }
      return;
    }
    if (latest.tokens.accessToken !== this.session?.tokens.accessToken) {
      this.session = latest;
      this.scheduleRefresh();
      this.emit('change', this.getState());
    }
  }

  private scheduleRefresh(delayMs?: number): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    if (!this.autoRefresh || !this.session?.tokens.refreshToken) return;

    const delay = delayMs ?? Math.max(0, this.session.tokens.expiresAt - this.leewayMs - Date.now());
    this.refreshTimer = setTimeout(() => {
      this.refresh().catch((error: unknown) => {
        if (!(error instanceof CustosError)) return;
        this.emit('error', error);
        if (error.retryable && this.session) this.scheduleRefresh(RETRY_DELAY_MS);
      });
    }, Math.min(delay, MAX_TIMER_MS));
    // Don't keep Node (tests, SSR) alive just for this timer.
    (this.refreshTimer as { unref?: () => void }).unref?.();
  }
}
