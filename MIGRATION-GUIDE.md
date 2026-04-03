# Migration Guide - Custos SDK

Este documento resume cambios relevantes para migrar integraciones anteriores al SDK actual.

## Cambios clave

- El callback OAuth ya no se procesa automaticamente en el constructor.
- Se debe detectar callback y llamar `handleCallback()` de forma explicita.
- Se agrego `silentAuth()` para restaurar sesion al iniciar la app.
- Se agrego `getTokenExpiry()` en estado publico.
- `AuthState` ahora incluye `tokenExpiry: Date | null`.
- Se agrego evento `session-restored`.
- Se agrego `revoke()` para revocar access/refresh token y limpiar sesion local.
- Se corrigio el scheduler de refresh para descontar tiempo transcurrido.
- `logout()` limpia storage incluso si falla el endpoint remoto.

## Antes vs ahora

### Callback

Antes (implicito):

```ts
const auth = new Custos(config);
// se esperaba que el constructor resolviera todo
```

Ahora (explicito):

```ts
const auth = new Custos(config);

if (auth.hasCallbackParams()) {
  await auth.handleCallback();
}
```

### Restauracion de sesion

Antes:

```ts
// logica custom para revisar storage
```

Ahora:

```ts
const restored = await auth.silentAuth();
```

### Cierre de sesion fuerte

Antes:

```ts
await auth.logout();
```

Ahora (opcional):

```ts
await auth.revoke({ accessToken: true, refreshToken: true });
```

## Checklist de migracion

1. Quitar supuestos de callback automatico.
2. Invocar `hasCallbackParams()` + `handleCallback()` en ruta callback.
3. Ejecutar `silentAuth()` en bootstrap de app.
4. Escuchar `session-restored` y `token-refresh` si tu UX lo requiere.
5. Usar `getState().tokenExpiry` para indicadores de sesion.
6. Si necesitas invalidacion remota de tokens, usar `revoke()`.

## Compatibilidad

- API publica principal (`login`, `logout`, `getUser`, `getAccessToken`) sigue disponible.
- Cambios son aditivos y de comportamiento en flujo recomendado.
