# @alimzen/custos-nestjs

Módulo de NestJS para [Custos](https://custos.alimzen.com): un guard que verifica los access tokens (con `@alimzen/custos-node`) y decoradores para rutas públicas, permisos, roles y claims.

```bash
npm install @alimzen/custos-nestjs @alimzen/custos-node
```

NestJS 10 u 11, Express o Fastify.

```ts
// app.module.ts
import { CustosModule } from '@alimzen/custos-nestjs';

@Module({
  imports: [
    CustosModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        issuer: config.getOrThrow('CUSTOS_ISSUER'),
        audience: config.getOrThrow('CUSTOS_CLIENT_ID'),
      }),
      globalGuard: true, // todas las rutas protegidas; excepciones con @Public()
    }),
  ],
})
export class AppModule {}
```

```ts
import { CurrentAuth, Public, RequirePermissions, RequireRoles, type CustosClaims } from '@alimzen/custos-nestjs';

@Controller('billing')
@RequireRoles('owner', 'admin')
export class BillingController {
  @Get()
  @RequirePermissions('billing:read')
  list(@CurrentAuth('tenantId') tenantId: string) { ... }

  @Get('me')
  me(@CurrentAuth() auth: CustosClaims) { return auth; }

  @Get('plans')
  @Public()
  plans() { ... }
}
```

Sin `globalGuard`, usa `@UseGuards(CustosGuard)` donde haga falta. Los requisitos de clase y de método se suman: `@RequirePermissions` exige todos; `@RequireRoles`, alguno. Errores: `401` sin token o con uno inválido, `403` sin permisos, `503` si no se pueden descargar las llaves.
