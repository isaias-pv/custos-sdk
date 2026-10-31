import { CustosAuthError } from './errors.js';
import {
  assertRequirements,
  createVerifier,
  extractBearerToken,
  type CustosClaims,
  type Requirements,
  type TokenVerifier,
  type VerifierOptions,
} from './verifier.js';

/** Structural types: works with Express, Connect, and anything with the same shape, without depending on them. */
export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  auth?: CustosClaims;
}

export interface AuthResponse {
  status(code: number): this;
  setHeader?(name: string, value: string): unknown;
  json(body: unknown): unknown;
}

export type Next = (error?: unknown) => void;

export interface CustosAuthOptions extends VerifierOptions {
  /** Let requests without a token through (with `req.auth` undefined). Invalid tokens are still rejected. */
  optional?: boolean;
  /** Reuse a verifier instead of creating one (it holds the key cache). */
  verifier?: TokenVerifier;
}

function reject(res: AuthResponse, error: CustosAuthError) {
  if (error.status === 401) {
    res.setHeader?.('WWW-Authenticate', `Bearer error="${error.toJSON().error}"`);
  }
  return res.status(error.status).json(error.toJSON());
}

/** Express/Connect middleware: verifies the bearer token and puts its claims in `req.auth`. */
export function custosAuth(options: CustosAuthOptions) {
  const verifier = options.verifier ?? createVerifier(options);

  return async (req: AuthRequest, res: AuthResponse, next: Next) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      if (options.optional) return next();
      return reject(res, new CustosAuthError('missing_token', 'Missing bearer token'));
    }
    try {
      req.auth = await verifier.verify(token);
      return next();
    } catch (error) {
      if (error instanceof CustosAuthError) return reject(res, error);
      return next(error);
    }
  };
}

/** Use after `custosAuth()`: answers 403 unless `req.auth` meets the requirements. */
export function requireAuth(requirements: Requirements = {}) {
  return (req: AuthRequest, res: AuthResponse, next: Next) => {
    if (!req.auth) return reject(res, new CustosAuthError('missing_token', 'Authentication required'));
    try {
      assertRequirements(req.auth, requirements);
      return next();
    } catch (error) {
      if (error instanceof CustosAuthError) return reject(res, error);
      return next(error);
    }
  };
}
