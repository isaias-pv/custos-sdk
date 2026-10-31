import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  CustosAuthError,
  assertRequirements,
  extractBearerToken,
  type CustosClaims,
  type Requirements,
  type TokenVerifier,
} from '@alimzen/custos-node';
import { CUSTOS_VERIFIER, IS_PUBLIC_KEY, REQUIREMENTS_KEY } from './constants.js';

interface HttpRequest {
  headers: Record<string, string | string[] | undefined>;
  auth?: CustosClaims;
}

/**
 * Verifies the bearer token and puts its claims in `request.auth`. Use it with `@UseGuards(CustosGuard)`,
 * or register it for every route with `CustosModule.forRoot({ ..., globalGuard: true })`.
 */
@Injectable()
export class CustosGuard implements CanActivate {
  // esbuild emits no decorator metadata: explicit @Inject everywhere.
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(CUSTOS_VERIFIER) private readonly verifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<HttpRequest>();
    const token = extractBearerToken(request.headers.authorization);
    try {
      if (!token) throw new CustosAuthError('missing_token', 'Missing bearer token');
      request.auth = await this.verifier.verify(token);
      const requirements = this.reflector.getAll<(Requirements | undefined)[]>(REQUIREMENTS_KEY, targets);
      for (const requirement of requirements) if (requirement) assertRequirements(request.auth, requirement);
      return true;
    } catch (error) {
      if (!(error instanceof CustosAuthError)) throw error;
      const body = error.toJSON();
      if (error.status === 403) throw new ForbiddenException(body);
      if (error.status === 503) throw new ServiceUnavailableException(body);
      throw new UnauthorizedException(body);
    }
  }
}
