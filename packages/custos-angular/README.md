# @alimzen/custos-angular

Integración de [Custos](https://custos.alimzen.com) para Angular 19+: provider, estado con signals, guard de rutas e interceptor HTTP. Sin decoradores ni NgModules.

```bash
npm install @alimzen/custos @alimzen/custos-angular
```

## Configurar

```ts
// app.config.ts
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideCustos, custosInterceptor } from '@alimzen/custos-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([custosInterceptor])),
    provideCustos({
      clientId: environment.custos.clientId,
      redirectUri: window.location.origin + '/',
      issuer: environment.custos.issuer,
      allowedUrls: [environment.apiUrl], // por defecto, solo el issuer
    }),
  ],
};
```

Durante la inicialización, `provideCustos` termina el login si la URL trae `?code=` (y lleva al usuario a la ruta que pidió) o restaura la sesión guardada. Desactívalo con `initialize: false`.

## Rutas

```ts
import { custosGuard, custosGuestGuard } from '@alimzen/custos-angular';

export const routes: Routes = [
  { path: 'auth/sign-in', canActivate: [custosGuestGuard({ redirectTo: '/dashboard' })], loadComponent: ... },
  {
    path: '',
    canActivate: [custosGuard({ redirectTo: '/auth/sign-in' })], // sin redirectTo, va directo al login de Custos
    children: [
      { path: 'billing', canActivate: [custosGuard({ permissions: ['billing:read'], forbiddenRedirectTo: '/403' })], ... },
    ],
  },
];
```

## Componentes

```ts
import { injectCustos } from '@alimzen/custos-angular';

@Component({
  template: `
    @if (auth.isAuthenticated()) {
      <span>{{ auth.user()?.name }}</span>
      <button (click)="auth.logout({ returnTo: '/' })">Salir</button>
    } @else {
      <button (click)="auth.login()">Entrar</button>
    }
    @if (auth.error(); as error) { <p role="alert">{{ error.message }}</p> }
  `,
})
export class Header {
  readonly auth = injectCustos();
}
```

`CustosAuth`: `state`, `user`, `isAuthenticated` y `error` (signals de solo lectura), `login()`, `logout()`, `getAccessToken()`, `getValidAccessToken()`, `hasPermission(...p)`, `hasRole(...r)` y `client` (la instancia de `Custos`).

## Interceptor

Añade el token a las peticiones cuyo URL empiece por algún `allowedUrls` (en límite de ruta: `https://api.test` no coincide con `https://api.test.evil.com`) o cumpla una `RegExp`. Lo renueva antes si está por caducar y, ante un 401, renueva y reintenta una vez. Para excluir una petición:

```ts
http.get(url, { context: new HttpContext().set(SKIP_CUSTOS_AUTH, true) });
```
