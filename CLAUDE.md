# Custos SDK

SDKs de Custos, el servidor de identidad de Alimzen (backend NestJS en `../auth`, dashboard Angular en `../auth-dashboard`). Sucesor de `@isaias_pv/custos-sdk` 1.5 (ver [MIGRACION.md](MIGRACION.md)). Misma estructura y convenciones que el monorepo de Relayo.

## Repo

- Monorepo pnpm (`packages/*`) + Changesets. TypeScript, tsup, Vitest y jsdom en la raíz.
- `packages/custos` → `@alimzen/custos`: navegador, sin dependencias. Clase `Custos` en `src/custos.ts`; errores en `src/errors.ts` (un solo `CustosError` con `code`); PKCE y `decodeJwt` en `src/encoding.ts`; peticiones, desenvoltura del sobre `{ code, message, data }` y normalización de tokens en `src/http.ts`; sesión y transacciones en `src/storage.ts`. Salidas ESM, CJS e IIFE (`dist/custos.global.js`, global `Custos`).
- `packages/custos-node` → `@alimzen/custos-node`: `createVerifier` (jose 5, dual CJS/ESM), `createIntrospector`, middleware Express estructural (`custosAuth`, `requireAuth`), `CustosAuthError` con `status`.
- `packages/custos-nestjs` → `@alimzen/custos-nestjs`: `CustosModule.forRoot/forRootAsync` (`globalGuard` va fuera del factory), `CustosGuard`, decoradores. Usar siempre `@Inject(token)` explícito: esbuild no emite metadata de decoradores.
- `packages/custos-angular` → `@alimzen/custos-angular`: solo funciones (`provideCustos`, `custosGuard`, `custosInterceptor`, `injectCustos`), sin decoradores, para compilar con tsup sin ng-packagr. Solo ESM. Los tests importan `@angular/compiler` (JIT) en `test/setup.ts`.
- Las integraciones declaran el paquete base como `peerDependency` con rango explícito `>=0.1.0 <1.0.0` y como `devDependency` `workspace:^`.
- Cada paquete exporta la condición `@alimzen/source` → `src/index.ts`; tsc y Vitest la usan; el build de tipos la desactiva para no incrustar el paquete base.
- Comandos (desde la raíz): `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm changeset`.

## Contrato con el backend

- Authorize `/v1/auth/authorize` (sin prefijo `api`); token, userinfo, revoke, logout e introspect bajo `/api/v1/auth/*`; JWKS y discovery en `/.well-known/*`.
- El backend envuelve casi todo como `{ code, message, data }`; el SDK acepta ese sobre y respuestas OAuth sin envolver.
- `/token` acepta `authorization_code` y `refresh_token`. El refresh token puede no rotar: el SDK conserva el anterior.

## Convenciones

- Node 20+, TypeScript estricto (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), imports relativos con extensión `.js`.
- Código, identificadores y comentarios en inglés; documentación en español.
- Seguridad por defecto: PKCE S256 siempre, `state` de un solo uso, ningún secreto en el navegador, el interceptor solo envía el token a `allowedUrls`.
