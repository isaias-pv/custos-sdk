# @alimzen/custos-node

Verifica en el servidor los access tokens de [Custos](https://custos.alimzen.com): firma RS256 contra el JWKS público (con caché y rotación de llaves), issuer, audiencia y caducidad. Opcionalmente, introspección (RFC 7662) para que un logout invalide el token al momento. Incluye middleware para Express/Connect.

```bash
npm install @alimzen/custos-node
```

Node 20+.

## Express

```ts
import { custosAuth, requireAuth } from '@alimzen/custos-node';

app.use('/api', custosAuth({ issuer: 'https://custos.alimzen.com', audience: 'mi-app' }));

app.get('/api/me', (req, res) => res.json(req.auth));
app.post('/api/facturas', requireAuth({ permissions: ['billing:write'] }), crearFactura);
app.delete('/api/tenants/:id', requireAuth({ roles: ['owner'] }), borrarTenant);
```

Responde `401` (con `WWW-Authenticate`) sin token o con uno inválido, `403` si faltan permisos o roles, y `503` si no puede descargar las llaves. Cuerpo en formato RFC 6750: `{ error, error_description }`. Con `optional: true` deja pasar peticiones anónimas.

## Sin framework

```ts
import { createVerifier, extractBearerToken, CustosAuthError } from '@alimzen/custos-node';

const verifier = createVerifier({ issuer: 'https://custos.alimzen.com', audience: 'mi-app' });

try {
  const claims = await verifier.verify(extractBearerToken(req.headers.authorization) ?? '');
  claims.sub; claims.tenantId; claims.permissions;
} catch (error) {
  if (error instanceof CustosAuthError) reply(error.status, error.toJSON());
}
```

| Opción | Por defecto | |
| --- | --- | --- |
| `issuer` | — | Obligatorio; debe coincidir con el claim `iss`. |
| `audience` | — | Tu `client_id`. Muy recomendable: sin ella se aceptan tokens emitidos para cualquier aplicación. |
| `jwksUri` | `${issuer}/.well-known/jwks.json` | |
| `clockTolerance` | `5` | Segundos de desfase de reloj admitidos. |
| `algorithms` | `['RS256']` | |
| `introspection` | — | `{ clientId, clientSecret, cacheTtl? }` de una aplicación confidencial: rechaza tokens de sesiones cerradas (`inactive_token`). |
| `keys` | — | Resolver de llaves propio (tests, llaves locales). |

Códigos de `CustosAuthError`: `missing_token`, `invalid_token`, `token_expired`, `inactive_token` (401), `insufficient_permissions` (403), `server_unavailable` (503).

`assertRequirements(claims, { permissions, roles })`: todos los permisos (`*` concede todos) y alguno de los roles (`role`, `tenantRole` o `roles`).
