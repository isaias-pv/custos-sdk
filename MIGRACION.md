# Migrar desde `@isaias_pv/custos-sdk` 1.x

`@isaias_pv/custos-sdk` queda congelado en 1.5.0. Su sucesor es `@alimzen/custos` (navegador) y `@alimzen/custos-node` (lo que antes era `/server`).

```bash
npm uninstall @isaias_pv/custos-sdk
npm install @alimzen/custos            # navegador
npm install @alimzen/custos-angular    # si usas Angular (incluye el anterior como peer)
npm install @alimzen/custos-node       # servidor
```

## Configuración

| 1.x | Ahora | Notas |
| --- | --- | --- |
| `apiUrl` | `issuer` | Mismo valor: la URL base de Custos. |
| `clientSecret` | — | Eliminado. Un secreto en el navegador no es secreto. |
| `state` | — | Eliminado. Antes se generaba **una vez** en el constructor (o lo fijabas tú, p. ej. `dev123xyz`) y se reutilizaba: anulaba la protección CSRF. Ahora es nuevo y de un solo uso en cada login. |
| `usePKCE`, `codeChallengeMethod` | — | PKCE con S256 siempre. |
| `responseType`, `grantType` | — | Solo authorization code. El flujo implícito no es seguro. |
| `useSessionStorage: true` | `storage: 'session'` | También `'memory'` o un objeto propio con `getItem/setItem/removeItem`. |
| — | `endpoints`, `refreshLeeway`, `autoRefresh`, `syncTabs`, `fetch` | Nuevos. |

## Métodos

| 1.x | Ahora |
| --- | --- |
| `login(params)` | `login({ appState, loginHint, prompt, params })` |
| `handleCallback(): void` | `handleCallback(): { user, tokens, appState }` |
| `silentAuth()` | `restore()` |
| `refreshToken()` | `refresh()` (devuelve el `TokenSet`; las llamadas concurrentes comparten la petición) |
| `revoke()` | `logout()` — ahora cierra la sesión en el servidor **y** revoca el refresh token (`revoke: false` para no revocarlo) |
| `getTokenExpiry()` | `getState().expiresAt` |
| `validateToken()` | — (verifica en el servidor con `@alimzen/custos-node`) |
| `clearStorage()` | `logout()` |
| — | `getValidAccessToken()`, `fetch()`, `subscribe()`, `buildAuthorizeUrl()` |

## Eventos

`on()` devuelve la función para desuscribirse y el listener recibe el dato directamente (antes, `{ type, data }`).

| 1.x | Ahora |
| --- | --- |
| `login` | `login` → `{ user, tokens, appState }` |
| `logout` | `logout` → `{ reason: 'user' \| 'expired' \| 'remote' }` |
| `token-refresh` | `refresh` → `{ tokens }` |
| `token-expired` | `logout` con `reason: 'expired'` |
| `session-restored` | el resultado de `restore()` |
| `error` | `error` → `CustosError` con `code` |
| — | `change` → `AuthState` (cualquier cambio, también desde otras pestañas) |

## Tipos

- `User` → `CustosUser`: `sub` en vez de `id`; `givenName`/`familyName` además de `name`; los claims originales en `claims`.
- `AuthTokens` → `TokenSet`: `expiresAt` (epoch ms) en vez de `expiresIn`.
- Errores: todos son `CustosError` con `code` (`invalid_state`, `oauth_error`, `login_required`, `network_error`...) y `retryable`.

## Servidor (`/server` → `@alimzen/custos-node`)

| 1.x | Ahora |
| --- | --- |
| `createTokenVerifier({ issuer, audience, clockToleranceSeconds })` | `createVerifier({ issuer, audience, clockTolerance })` |
| `custosAuthMiddleware(options)` | `custosAuth(options)` (+ `optional`, `requireAuth({ permissions, roles })`) |
| `TokenVerificationError` | `CustosAuthError` con `code` y `status` (401/403/503) |
| — | `introspection: { clientId, clientSecret }` para rechazar tokens de sesiones cerradas |

## Bugs de 1.x que desaparecen

- La renovación pedía `grant_type=refresh_token` a un endpoint que solo aceptaba `authorization_code`: nunca funcionó.
- `decodeToken()` usaba `atob` sobre base64url y fallaba con tokens que tuvieran `-` o `_`.
- El `code_verifier` tenía sesgo de módulo (`byte % 66`).
- Dos pestañas renovando a la vez podían invalidarse el refresh token mutuamente.
