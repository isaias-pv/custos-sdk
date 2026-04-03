# Custos SDK

SDK oficial de JavaScript/TypeScript para autenticacion con Custos usando OAuth 2.0 + PKCE.

## Contenido

- Instalacion
- Requisitos
- Exportaciones publicas
- Inicio rapido
- Flujo recomendado
- Configuracion
- API de Custos
- Eventos
- Tipos principales
- Utilidades exportadas
- Storage interno
- Endpoints usados por el SDK
- Buenas practicas
- Solucion de problemas

## Instalacion

```bash
npm install @isaias_pv/custos-sdk
```

## Requisitos

- Entorno browser moderno (usa Web Crypto API)
- Backend Custos accesible desde el frontend
- Aplicacion OAuth registrada con:
  - client_id valido
  - redirect_uri permitido
  - PKCE habilitado (recomendado)

## Exportaciones publicas

El paquete exporta:

- `Custos`
- `Storage`
- `ApiClient`
- Todos los tipos de `src/types.ts`
- Todas las utilidades de `src/utils.ts`

## Inicio rapido

```ts
import { Custos } from '@isaias_pv/custos-sdk';

const auth = new Custos({
  clientId: 'my-client-id',
  redirectUri: window.location.origin + '/auth/callback',
  apiUrl: 'https://custos.alimzen.com',
  scope: 'openid profile email',
  usePKCE: true,
  useSessionStorage: false,
});
```

### Login

```ts
await auth.login();
```

### Callback

```ts
if (auth.hasCallbackParams()) {
  await auth.handleCallback();
}
```

### Recuperar sesion al iniciar app

```ts
const restored = await auth.silentAuth();
if (!restored) {
  // mostrar vista de login
}
```

### Logout

```ts
await auth.logout();
```

### Revocar tokens + limpiar sesion

```ts
await auth.revoke({ accessToken: true, refreshToken: true });
```

## Flujo recomendado

1. Crear instancia de `Custos` al iniciar app.
2. Registrar listeners con `on(...)`.
3. Al entrar a callback, verificar `hasCallbackParams()` y llamar `handleCallback()`.
4. En arranque de app, llamar `silentAuth()` para restaurar sesion.
5. Usar `getAccessToken()` para requests autenticados.
6. Cerrar sesion con `logout()` o `revoke()`.

## Configuracion

Interfaz `CustosConfig`:

- `clientId: string` (requerido)
- `redirectUri: string` (requerido)
- `clientSecret?: string` (solo si tu flujo lo requiere)
- `apiUrl?: string` default: `https://custos.alimzen.com`
- `scope?: string | string[]` default: `openid profile`
- `responseType?: 'code' | 'token'` default: `code`
- `state?: string` default: generado aleatoriamente
- `usePKCE?: boolean` default: `true`
- `codeChallengeMethod?: 'S256' | 'plain'` default: `S256`
- `grantType?: 'authorization_code' | 'refresh_token' | 'client_credentials'` default: `authorization_code`
- `useSessionStorage?: boolean` default: `false` (usa localStorage)

## API de Custos

### Constructor

```ts
new Custos(config: CustosConfig)
```

### Metodos de autenticacion

```ts
login(additionalParams?: Record<string, string>): Promise<void>
handleCallback(): Promise<void>
logout(): Promise<void>
refreshToken(): Promise<void>
revoke(options?: { accessToken?: boolean; refreshToken?: boolean }): Promise<void>
silentAuth(): Promise<boolean>
validateToken(): Promise<boolean>
```

### Estado y usuario

```ts
isAuthenticated(): boolean
getState(): AuthState
getUser(): User | null
getAccessToken(): string | null
getRefreshToken(): string | null
getTokenExpiry(): Date | null
hasCallbackParams(): boolean
```

### Eventos

```ts
on(event: AuthEventType, callback: (event: AuthEvent) => void): void
off(event: AuthEventType, callback: (event: AuthEvent) => void): void
```

### Utilidades de ciclo de vida

```ts
clearStorage(): void
destroy(): void
```

## Eventos

`AuthEventType` soportados:

- `login`
- `logout`
- `error`
- `token-refresh`
- `token-expired`
- `session-restored`

Ejemplo:

```ts
auth.on('login', (event) => {
  console.log('Login:', event.data.user);
});

auth.on('token-refresh', (event) => {
  console.log('Nuevo token:', event.data.accessToken);
});

auth.on('session-restored', (event) => {
  console.log('Sesion restaurada:', event.data.user);
});

auth.on('error', (event) => {
  console.error('Auth error:', event.data);
});
```

## Tipos principales

### AuthTokens

```ts
interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn: number;
  scope?: string;
}
```

### User

```ts
interface User {
  id: string;
  email: string;
  username?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  emailVerified?: boolean;
  isVerified?: boolean;
  isMfaEnabled?: boolean;
  roles?: { tenantId: string; tenantSlug?: string; role: string }[];
  permissions?: string[];
  [key: string]: any;
}
```

### AuthState

```ts
interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  tokens: AuthTokens | null;
  tokenExpiry: Date | null;
}
```

## Utilidades exportadas

Desde `utils`:

- `generateState(): string`
- `generateCodeVerifier(): string`
- `generateCodeChallenge(codeVerifier: string): Promise<string>`
- `parseQueryString(url: string): Record<string, string>`
- `normalizeScope(scope?: string | string[]): string`
- `isValidUrl(url: string): boolean`
- `normalizeUrl(url: string): string`
- `isTokenExpired(token: string): boolean`
- `decodeToken(token: string): any`

## Storage interno

La clase `Storage` persiste con prefijo `custos_`:

- `custos_tokens`
- `custos_token_issued_at`
- `custos_user`
- `custos_oauth_state`
- `custos_code_verifier`
- `custos_code_challenge`

Si `useSessionStorage` es `true`, usa `sessionStorage`; en caso contrario, `localStorage`.

## Endpoints usados por el SDK

`ApiClient` consume:

- `POST /api/v1/auth/token` (code exchange + refresh)
- `GET /api/v1/auth/validate`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/revoke`
- `GET /api/v1/system/users/profile`

Notas:

- El SDK soporta respuestas `204 No Content`.
- Si la respuesta exitosa no es JSON, el request retorna `undefined`.

## Buenas practicas

- Mantener `usePKCE: true`.
- Usar `responseType: 'code'`.
- Llamar `destroy()` al desmontar componentes/paginas.
- Escuchar `token-expired` y `error` para manejo UX.
- Usar `silentAuth()` en bootstrap de app para evitar flicker de login.

## Solucion de problemas

### Invalid state parameter

Causas comunes:

- Se perdio `custos_oauth_state` antes del callback.
- Se abrio callback en otra pestana/sesion.
- Se reutilizo un link viejo de callback.

### Code verifier not found

Causas comunes:

- PKCE habilitado pero no se preservo `custos_code_verifier`.
- Limpieza de storage antes de `handleCallback()`.

### No refresh token available

Causas comunes:

- El servidor no devolvio refresh token.
- El token fue limpiado o sobrescrito.

### Login redirige pero no autentica

Checklist:

1. Verificar `redirectUri` exacto registrado en el backend.
2. Confirmar que se llama `handleCallback()` solo en ruta callback.
3. Revisar listener de `error` para detalle del fallo.

## Licencia

MIT
