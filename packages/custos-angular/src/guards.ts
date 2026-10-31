import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { CUSTOS_AUTH, userHasPermissions, userHasRole } from './providers.js';

export interface CustosGuardOptions {
  /**
   * Route to send anonymous users to (gets `?returnTo=`). Without it, the guard starts the
   * Custos login right away and comes back to the requested page.
   */
  redirectTo?: string;
  /** The user must hold all these permissions. */
  permissions?: string[];
  /** The user must hold any of these roles. */
  roles?: string[];
  /** Route for logged-in users without the permissions or roles. Without it, navigation is just blocked. */
  forbiddenRedirectTo?: string;
}

/**
 * @example
 * { path: 'billing', canActivate: [custosGuard({ permissions: ['billing:read'] })], loadComponent: ... }
 */
export function custosGuard(options: CustosGuardOptions = {}): CanActivateFn {
  return async (_route, state) => {
    const auth = inject(CUSTOS_AUTH);
    const router = inject(Router);

    if (!auth.isAuthenticated() && !(await auth.getValidAccessToken())) {
      if (options.redirectTo) {
        return router.createUrlTree([options.redirectTo], { queryParams: { returnTo: state.url } });
      }
      await auth.login({ appState: { returnTo: state.url } });
      return false;
    }

    const user = auth.user();
    const allowed = userHasPermissions(user, options.permissions ?? []) && userHasRole(user, options.roles ?? []);
    if (allowed) return true;
    return options.forbiddenRedirectTo ? router.parseUrl(options.forbiddenRedirectTo) : false;
  };
}

/** For pages only anonymous users should see (sign-in): logged-in users go to `redirectTo`. */
export function custosGuestGuard(options: { redirectTo: string }): CanActivateFn {
  return () => {
    const auth = inject(CUSTOS_AUTH);
    return auth.isAuthenticated() ? inject(Router).parseUrl(options.redirectTo) : true;
  };
}
