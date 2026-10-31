import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { CustosClaims } from '@alimzen/custos-node';
import { IS_PUBLIC_KEY, REQUIREMENTS_KEY } from './constants.js';

/** Skips authentication for a controller or route (when the guard is registered globally). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** The token must carry all these permissions. Method-level requirements add to class-level ones. */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(REQUIREMENTS_KEY, { permissions });

/** The token must carry any of these roles. */
export const RequireRoles = (...roles: string[]) => SetMetadata(REQUIREMENTS_KEY, { roles });

/**
 * Claims of the verified token, or one of them.
 * @example
 * me(@CurrentAuth() auth: CustosClaims, @CurrentAuth('tenantId') tenantId: string)
 */
export const CurrentAuth = createParamDecorator((claim: keyof CustosClaims | undefined, ctx: ExecutionContext) => {
  const auth = ctx.switchToHttp().getRequest<{ auth?: CustosClaims }>().auth;
  return claim ? auth?.[claim] : auth;
});
