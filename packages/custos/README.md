# @alimzen/custos

SDK de navegador para [Custos](https://custos.alimzen.com): login OAuth 2.0 con PKCE, sesión persistente, renovación automática de tokens (coordinada entre pestañas) y un `fetch` autenticado. Sin dependencias.

```bash
npm install @alimzen/custos
```

## Uso

```ts
import { Custos, CustosError } from '@alimzen/custos';

export const custos = new Custos({
  clientId: 'mi-app',
  redirectUri: `${location.origin}/callback`, // registrada en la aplicación de Custos
  issuer: 'https://custos.alimzen.com',       // por defecto
});

// Al arrancar la app
if (custos.hasCallbackParams()) {
  try {
    const { user, appState } = await custos.handleCallback();
    navigate((appState as { returnTo?: string })?.returnTo ?? '/');
  } catch (error) {
    if (error instanceof CustosError && error.code === 'oauth_error') showMessage(error.message);
  }
} else {
  await custos.restore(); // recupera la sesión guardada y la renueva si caducó
}

// Proteger una pantalla
if (!custos.isAuthenticated()) await custos.login({ appState: { returnTo: location.pathname } });

// Llamar a tu API: añade el token, lo renueva si va a caducar y reintenta una vez ante un 401
const res = await custos.fetch('https://api.miapp.com/pedidos');

// Reaccionar a cambios (también los de otras pestañas)
const stop = custos.subscribe(({ isAuthenticated, user }) => render(user));

await custos.logout({ returnTo: '/' });
```

Sin bundler:

```html
<script src="https://unpkg.com/@alimzen/custos/dist/custos.global.js"></script>
<script>
  const custos = new Custos.Custos({ clientId: 'mi-app', redirectUri: location.href.split('?')[0] });
</script>
```

## Configuración

| Opción | Por defecto | |
| --- | --- | --- |
| `clientId` | — | Obligatorio. |
| `redirectUri` | — | Obligatoria, absoluta. Sin `#`: OAuth no admite fragmentos en el redirect. |
| `issuer` | `https://custos.alimzen.com` | URL base del servidor. |
| `scope` | `openid profile email` | Texto o array. |
| `storage` | `local` | `local` (compartida entre pestañas), `session`, `memory` o un objeto con `getItem/setItem/removeItem`. |
| `autoRefresh` | `true` | Renueva el access token antes de que caduque. |
| `refreshLeeway` | `60` | Segundos antes del `exp` en que el token se considera caducado. |
| `syncTabs` | `true` | Login, logout y renovaciones se reflejan en todas las pestañas (solo con `storage: 'local'`). |
| `endpoints` | ver abajo | Rutas relativas al `issuer` o URLs absolutas. `userinfo: false` construye el usuario solo con el token. |
| `fetch` | global | Para tests, SSR o instrumentación. |

Endpoints por defecto: `authorize` `/v1/auth/authorize`, `token` `/api/v1/auth/token`, `userinfo` `/api/v1/auth/userinfo`, `revoke` `/api/v1/auth/revoke`, `logout` `/api/v1/auth/logout`.

## API

| | |
| --- | --- |
| `login(options?)` | Redirige al login. `appState` vuelve en `handleCallback()`; también `loginHint`, `prompt`, `params`. |
| `buildAuthorizeUrl(options?)` | Igual, pero devuelve la URL sin navegar (popups, apps nativas, tests). |
| `hasCallbackParams(url?)` | La URL trae `code`+`state` o `error`. |
| `handleCallback(url?)` | Valida el `state`, canjea el código con PKCE, carga el usuario y limpia la barra de direcciones. Funciona con routers por hash (`/#/callback?code=`). |
| `restore()` | Al arrancar: `true` si hay sesión válida (renovándola si hace falta). |
| `isAuthenticated()`, `getUser()`, `getState()` | Estado síncrono. |
| `getAccessToken()` | Token vigente o `null`; nunca renueva. |
| `getValidAccessToken()` | Renueva antes si está por caducar; `null` si hay que volver a iniciar sesión. |
| `refresh()` | Renueva ya. Las llamadas concurrentes (y las de otras pestañas) comparten una sola petición. |
| `fetch(input, init?)` | `fetch` con `Authorization`; ante un 401 renueva y reintenta una vez. |
| `logout({ revoke?, returnTo? })` | Cierra la sesión en el servidor, revoca el refresh token y limpia la local aunque el servidor falle. |
| `on(evento, fn)` / `subscribe(fn)` | Devuelven la función para desuscribirse. |
| `destroy()` | Para temporizadores y listeners (la sesión guardada se conserva). |

Eventos: `login`, `logout` (`reason: 'user' | 'expired' | 'remote'`), `refresh`, `error`, `change`.

## Errores

Todo error es un `CustosError` con `code`:

| `code` | Cuándo | `retryable` |
| --- | --- | --- |
| `invalid_config` | Configuración inválida. | no |
| `invalid_callback` | La URL no trae `code`+`state`. | no |
| `invalid_state` | Login no iniciado aquí, ya usado o caducado (15 min). Empieza de nuevo. | no |
| `oauth_error` | El servidor devolvió un error OAuth (`oauthError`: `access_denied`, `invalid_grant`...). | no |
| `login_required` | No hay sesión o no se pudo renovar. | no |
| `network_error` | Sin respuesta (offline, DNS, CORS). | sí |
| `http_error` | Estado HTTP inesperado (`status`). | si `status >= 500` |
| `unsupported_environment` | Falta Web Crypto (requiere https o localhost). | no |

`decodeJwt(token)` lee los claims **sin verificar la firma**: sirve para mostrar datos, nunca para autorizar. Para eso, `@alimzen/custos-node` en el servidor.
