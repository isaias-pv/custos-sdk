# Quick Start - Custos SDK

Guia rapida para integrar el SDK en una aplicacion web.

## 1) Instalar

```bash
npm install @isaias_pv/custos-sdk
```

## 2) Inicializar

```ts
import { Custos } from '@isaias_pv/custos-sdk';

export const auth = new Custos({
  clientId: 'my-client-id',
  redirectUri: window.location.origin + '/auth/callback',
  apiUrl: 'https://custos.alimzen.com',
  scope: 'openid profile email',
  usePKCE: true,
  useSessionStorage: false,
});
```

## 3) Registrar listeners

```ts
auth.on('login', ({ data }) => {
  console.log('Login OK', data.user);
});

auth.on('error', ({ data }) => {
  console.error('Error auth', data);
});

auth.on('session-restored', ({ data }) => {
  console.log('Sesion restaurada', data.user);
});
```

## 4) Login

```ts
await auth.login();
```

## 5) Callback

```ts
if (auth.hasCallbackParams()) {
  await auth.handleCallback();
}
```

## 6) Bootstrap de app

```ts
const restored = await auth.silentAuth();
if (!restored) {
  // mostrar login
}
```

## 7) Logout / Revoke

```ts
await auth.logout();
// o
await auth.revoke({ accessToken: true, refreshToken: true });
```

## 8) Obtener estado

```ts
const state = auth.getState();
console.log(state.isAuthenticated, state.tokenExpiry);
```

## Siguiente paso

Revisa `README.md` para referencia completa de metodos, tipos, utilidades y troubleshooting.
