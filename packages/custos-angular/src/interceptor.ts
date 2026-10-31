import { inject } from '@angular/core';
import { HttpContextToken, HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { CUSTOS_AUTH, CUSTOS_OPTIONS } from './providers.js';

/** Set to `true` on a request to send it without the access token. */
export const SKIP_CUSTOS_AUTH = new HttpContextToken<boolean>(() => false);
const RETRIED = new HttpContextToken<boolean>(() => false);

/** Prefix match on a path boundary: `https://api.test` does not match `https://api.test.evil.com`. */
export function urlAllowed(url: string, allowed: (string | RegExp)[]): boolean {
  return allowed.some((rule) => {
    if (rule instanceof RegExp) return rule.test(url);
    const prefix = rule.replace(/\/+$/, '');
    return url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`);
  });
}

function withToken<T>(req: HttpRequest<T>, token: string | null): HttpRequest<T> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

/**
 * Adds the access token to requests for `allowedUrls`, renewing it first when it's about to expire.
 * On a 401 it renews the token and retries the request once.
 */
export const custosInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(CUSTOS_AUTH);
  const { allowedUrls = [] } = inject(CUSTOS_OPTIONS);
  if (req.context.get(SKIP_CUSTOS_AUTH) || !urlAllowed(req.url, allowedUrls)) return next(req);

  return from(auth.getValidAccessToken()).pipe(
    switchMap((token) => next(withToken(req, token))),
    catchError((error: unknown) => {
      const canRetry =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !req.context.get(RETRIED) &&
        !!auth.client.getState().tokens?.refreshToken;
      if (!canRetry) return throwError(() => error);
      return from(auth.client.refresh()).pipe(
        switchMap((tokens) => next(withToken(req.clone({ context: req.context.set(RETRIED, true) }), tokens.accessToken))),
      );
    }),
  );
};
