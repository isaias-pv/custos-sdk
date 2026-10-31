# Custos

SDKs oficiales de [Custos](https://custos.alimzen.com), el servidor de identidad de Alimzen (OAuth 2.0 + PKCE, OpenID Connect, multi-tenant).

| Paquete | Para qué |
| --- | --- |
| [`@alimzen/custos`](packages/custos) | Navegador: login con PKCE, sesión, renovación de tokens entre pestañas, `fetch` autenticado. Sin dependencias. |
| [`@alimzen/custos-angular`](packages/custos-angular) | Angular 19+: `provideCustos()`, signals, guard e interceptor HTTP. |
| [`@alimzen/custos-node`](packages/custos-node) | Servidor: verificar access tokens (JWKS con rotación), introspección y middleware Express. |
| [`@alimzen/custos-nestjs`](packages/custos-nestjs) | NestJS: `CustosModule`, `CustosGuard`, `@Public`, `@RequirePermissions`, `@RequireRoles`, `@CurrentAuth`. |

## En 30 segundos

```ts
// Frontend
import { Custos } from '@alimzen/custos';

const custos = new Custos({ clientId: 'mi-app', redirectUri: `${location.origin}/callback` });

if (custos.hasCallbackParams()) await custos.handleCallback();
else await custos.restore();

if (!custos.isAuthenticated()) await custos.login();
const res = await custos.fetch('https://api.miapp.com/pedidos'); // token añadido y renovado solo
```

```ts
// Backend
import { custosAuth, requireAuth } from '@alimzen/custos-node';

app.use('/api', custosAuth({ issuer: 'https://custos.alimzen.com', audience: 'mi-app' }));
app.get('/api/facturas', requireAuth({ permissions: ['billing:read'] }), handler);
```

## Seguridad: qué hace el SDK por ti

- **PKCE S256 siempre** y un `state` nuevo y de un solo uso por cada login (guardado en `sessionStorage`, caduca a los 15 minutos).
- La caducidad sale del `exp` del propio token, no del reloj del cliente.
- Una sola renovación en curso aunque la pidan varias llamadas o varias pestañas (`navigator.locks`).
- El logout de una pestaña cierra la sesión en todas.
- El interceptor de Angular solo envía el token a los orígenes de `allowedUrls`.
- En el navegador no hay `clientSecret`: una SPA es un cliente público.

## Desarrollo

Monorepo pnpm + Changesets; TypeScript, tsup y Vitest en la raíz.

```bash
pnpm install
pnpm typecheck && pnpm build && pnpm test
pnpm changeset   # describir cada cambio publicable
```

Publicar: al fusionar en `main`, la acción de release abre el PR “Version packages”; al fusionarlo se publica en npm.

¿Vienes de `@isaias_pv/custos-sdk`? Lee [MIGRACION.md](MIGRACION.md).

## Licencia

MIT © Alimzen
