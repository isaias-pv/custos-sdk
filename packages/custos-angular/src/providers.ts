import {
  DestroyRef,
  InjectionToken,
  computed,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
  signal,
  type EnvironmentProviders,
  type Provider,
  type Signal,
} from '@angular/core';
import { Location } from '@angular/common';
import {
  Custos,
  CustosError,
  DEFAULT_ISSUER,
  type AuthState,
  type CustosConfig,
  type CustosUser,
  type LoginOptions,
  type LogoutOptions,
} from '@alimzen/custos';

export interface CustosAngularOptions extends CustosConfig {
  /**
   * Requests whose URL starts with one of these prefixes (or matches the RegExp) get the access token.
   * Default: the issuer. Never send the token to hosts you don't control.
   */
  allowedUrls?: (string | RegExp)[];
  /**
   * During app initialization, finish a login (`?code=...`) or restore the stored session.
   * Default: `true`.
   */
  initialize?: boolean;
}

/** Signal-based facade over the `Custos` client. */
export interface CustosAuth {
  readonly client: Custos;
  readonly state: Signal<AuthState>;
  readonly user: Signal<CustosUser | null>;
  readonly isAuthenticated: Signal<boolean>;
  /** Last error finishing a login (e.g. the user denied access), to show it in the UI. */
  readonly error: Signal<CustosError | null>;
  login(options?: LoginOptions): Promise<void>;
  logout(options?: LogoutOptions): Promise<void>;
  getAccessToken(): string | null;
  getValidAccessToken(): Promise<string | null>;
  hasPermission(...permissions: string[]): boolean;
  hasRole(...roles: string[]): boolean;
}

export const CUSTOS_OPTIONS = new InjectionToken<CustosAngularOptions>('CUSTOS_OPTIONS');
export const CUSTOS = new InjectionToken<Custos>('CUSTOS');
export const CUSTOS_AUTH = new InjectionToken<CustosAuth>('CUSTOS_AUTH');

export function injectCustos(): CustosAuth {
  return inject(CUSTOS_AUTH);
}

/** Every permission (`*` grants all). */
export function userHasPermissions(user: CustosUser | null, permissions: string[]): boolean {
  const granted = new Set(user?.permissions ?? []);
  return permissions.every((p) => granted.has(p) || granted.has('*'));
}

/** Any of the roles. */
export function userHasRole(user: CustosUser | null, roles: string[]): boolean {
  if (!roles.length) return true;
  const held = new Set([user?.role, ...(user?.roles ?? [])].filter(Boolean));
  return roles.some((r) => held.has(r));
}

function createAuth(client: Custos): CustosAuth {
  const state = signal<AuthState>(client.getState());
  const error = signal<CustosError | null>(null);
  const unsubscribe = [
    client.subscribe((next) => state.set(next)),
    client.on('error', (e) => error.set(e)),
    client.on('login', () => error.set(null)),
  ];
  inject(DestroyRef).onDestroy(() => {
    unsubscribe.forEach((fn) => fn());
    client.destroy();
  });

  const user = computed(() => state().user);
  return {
    client,
    state: state.asReadonly(),
    user,
    isAuthenticated: computed(() => state().isAuthenticated),
    error: error.asReadonly(),
    login: (options) => client.login(options),
    logout: (options) => client.logout(options),
    getAccessToken: () => client.getAccessToken(),
    getValidAccessToken: () => client.getValidAccessToken(),
    hasPermission: (...permissions) => userHasPermissions(user(), permissions),
    hasRole: (...roles) => userHasRole(user(), roles),
  };
}

async function initialize(): Promise<void> {
  const auth = inject(CUSTOS_AUTH);
  const location = inject(Location, { optional: true });
  if (auth.client.hasCallbackParams()) {
    try {
      const { appState } = await auth.client.handleCallback();
      const returnTo = (appState as { returnTo?: unknown } | undefined)?.returnTo;
      // Before the router's first navigation, so it lands straight on the page the user wanted.
      if (typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
        location?.replaceState(returnTo);
      }
    } catch {
      // Already in auth.error(); a failed login must not stop the app from booting.
    }
    return;
  }
  await auth.client.restore();
}

/**
 * @example
 * bootstrapApplication(App, {
 *   providers: [
 *     provideRouter(routes),
 *     provideHttpClient(withInterceptors([custosInterceptor])),
 *     provideCustos({ clientId: 'my-app', redirectUri: window.location.origin, issuer: environment.custos }),
 *   ],
 * });
 */
export function provideCustos(options: CustosAngularOptions): EnvironmentProviders {
  const { allowedUrls: _, initialize: init, ...config } = options;
  const providers: (Provider | EnvironmentProviders)[] = [
    { provide: CUSTOS_OPTIONS, useValue: { ...options, allowedUrls: options.allowedUrls ?? [options.issuer ?? DEFAULT_ISSUER] } },
    { provide: CUSTOS, useFactory: () => new Custos(config) },
    { provide: CUSTOS_AUTH, useFactory: () => createAuth(inject(CUSTOS)) },
  ];
  if (init !== false) providers.push(provideAppInitializer(initialize));
  return makeEnvironmentProviders(providers);
}
