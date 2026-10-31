import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { CustosAuthError } from './errors.js';
import { createIntrospector, type IntrospectionOptions, type Introspector } from './introspection.js';

/** Claims of a Custos access token. */
export interface CustosClaims extends JWTPayload {
  sub: string;
  userId?: string;
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  tenantId?: string;
  tenantSlug?: string;
  tenantRole?: string;
  projectId?: string;
  applicationId?: string;
  clientId?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
  sessionId?: string;
  scope?: string;
}

export interface VerifierOptions {
  /** Base URL of Custos; must match the token's `iss` claim. E.g. `https://custos.alimzen.com`. */
  issuer: string;
  /** Expected `aud` (your `client_id`). Strongly recommended: without it, tokens for any app are accepted. */
  audience?: string | string[];
  /** Default: `${issuer}/.well-known/jwks.json`. */
  jwksUri?: string;
  /** Allowed clock skew, in seconds. Default: 5. */
  clockTolerance?: number;
  /** Default: `['RS256']`. */
  algorithms?: string[];
  /**
   * Also ask Custos whether the session is still open (RFC 7662), so logouts and revocations take
   * effect before the token expires. Costs one request per token (cached for `cacheTtl` seconds).
   */
  introspection?: Omit<IntrospectionOptions, 'issuer'>;
  /** Key resolver for tests or keys you hold locally; replaces the JWKS download. */
  keys?: JWTVerifyGetKey;
}

export interface TokenVerifier {
  verify(token: string): Promise<CustosClaims>;
}

/**
 * Verifies Custos access tokens with the public JWKS. Keys are cached and fetched again when a new
 * `kid` appears (key rotation).
 */
export function createVerifier(options: VerifierOptions): TokenVerifier {
  if (!options?.issuer) throw new TypeError('createVerifier: issuer is required');
  const issuer = options.issuer.replace(/\/+$/, '');
  const keys = options.keys ?? createRemoteJWKSet(new URL(options.jwksUri ?? `${issuer}/.well-known/jwks.json`));
  const introspector: Introspector | undefined = options.introspection
    ? createIntrospector({ issuer, ...options.introspection })
    : undefined;

  return {
    async verify(token) {
      if (!token) throw new CustosAuthError('missing_token', 'Missing bearer token');
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(token, keys, {
          issuer,
          algorithms: options.algorithms ?? ['RS256'],
          clockTolerance: options.clockTolerance ?? 5,
          ...(options.audience === undefined ? {} : { audience: options.audience }),
        }));
      } catch (error) {
        throw toAuthError(error);
      }

      const sub = payload.sub ?? (typeof payload.userId === 'string' ? payload.userId : undefined);
      if (!sub) throw new CustosAuthError('invalid_token', 'The token has no subject');
      if (payload.type === 'authorization_code') {
        throw new CustosAuthError('invalid_token', 'Authorization codes are not access tokens');
      }

      if (introspector && !(await introspector.isActive(token))) {
        throw new CustosAuthError('inactive_token', 'The session of this token was closed');
      }
      return { ...payload, sub } as CustosClaims;
    },
  };
}

function toAuthError(error: unknown): CustosAuthError {
  if (error instanceof CustosAuthError) return error;
  if (error instanceof errors.JWTExpired) return new CustosAuthError('token_expired', 'The token has expired', { cause: error });
  if (error instanceof errors.JWKSTimeout || (error instanceof Error && /fetch failed|ECONNREFUSED|ENOTFOUND/.test(error.message))) {
    return new CustosAuthError('server_unavailable', 'Could not fetch the Custos signing keys', { cause: error });
  }
  const message = error instanceof errors.JOSEError ? error.message : 'Invalid token';
  return new CustosAuthError('invalid_token', message, { cause: error });
}

export function extractBearerToken(authorization: string | string[] | null | undefined): string | null {
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1] ?? null;
}

export interface Requirements {
  /** The token must carry **all** these permissions. `*` in the token grants everything. */
  permissions?: string[];
  /** The token must carry **any** of these roles (`role`, `tenantRole` or `roles`). */
  roles?: string[];
}

/** Throws `insufficient_permissions` when the claims don't meet the requirements. */
export function assertRequirements(claims: CustosClaims, requirements: Requirements): void {
  const granted = new Set(claims.permissions ?? []);
  const missing = (requirements.permissions ?? []).filter((p) => !granted.has(p) && !granted.has('*'));
  if (missing.length) {
    throw new CustosAuthError('insufficient_permissions', `Missing permissions: ${missing.join(', ')}`);
  }
  if (requirements.roles?.length) {
    const roles = new Set([claims.role, claims.tenantRole, ...(claims.roles ?? [])].filter(Boolean));
    if (!requirements.roles.some((r) => roles.has(r))) {
      throw new CustosAuthError('insufficient_permissions', `Requires one of the roles: ${requirements.roles.join(', ')}`);
    }
  }
}
