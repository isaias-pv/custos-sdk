import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

export interface CustosTokenPayload extends JWTPayload {
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
	permissions?: string[];
	sessionId?: string;
}

export interface VerifierOptions {
	/** Issuer del servidor de autenticación, p. ej. https://clerk.auth.guruxy.com */
	issuer: string;
	/** Por defecto: `${issuer}/.well-known/jwks.json` */
	jwksUri?: string;
	/** Si se indica, el claim `aud` debe coincidir (p. ej. tu client_id) */
	audience?: string | string[];
	/** Tolerancia de reloj en segundos (por defecto 5) */
	clockToleranceSeconds?: number;
}

export interface TokenVerifier {
	verify(token: string): Promise<CustosTokenPayload>;
}

export class TokenVerificationError extends Error {
	constructor(message: string, public readonly cause?: unknown) {
		super(message);
		this.name = 'TokenVerificationError';
	}
}

/**
 * Crea un verificador de access tokens RS256 usando el JWKS público.
 * Las llaves se cachean y se refrescan automáticamente cuando aparece un `kid` nuevo.
 */
export function createTokenVerifier(options: VerifierOptions): TokenVerifier {
	const issuer = options.issuer.replace(/\/+$/, '');
	const jwks = createRemoteJWKSet(new URL(options.jwksUri ?? `${issuer}/.well-known/jwks.json`));

	return {
		async verify(token: string): Promise<CustosTokenPayload> {
			try {
				const { payload } = await jwtVerify(token, jwks, {
					issuer,
					audience: options.audience,
					algorithms: ['RS256'],
					clockTolerance: options.clockToleranceSeconds ?? 5,
				});
				return payload as CustosTokenPayload;
			} catch (error) {
				throw new TokenVerificationError(
					error instanceof Error ? error.message : 'Token inválido',
					error,
				);
			}
		},
	};
}

export function extractBearerToken(authorization?: string | null): string | null {
	if (!authorization) return null;
	const [scheme, token] = authorization.split(' ');
	return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

interface ExpressLikeRequest {
	headers: Record<string, string | string[] | undefined>;
	auth?: CustosTokenPayload;
}
interface ExpressLikeResponse {
	status(code: number): { json(body: unknown): unknown };
}

/** Middleware para Express/Connect: valida el Bearer token y expone el payload en `req.auth`. */
export function custosAuthMiddleware(options: VerifierOptions) {
	const verifier = createTokenVerifier(options);

	return async (req: ExpressLikeRequest, res: ExpressLikeResponse, next: (err?: unknown) => void) => {
		const header = req.headers.authorization;
		const token = extractBearerToken(Array.isArray(header) ? header[0] : header);
		if (!token) {
			return res.status(401).json({ error: 'missing_token' });
		}
		try {
			req.auth = await verifier.verify(token);
			return next();
		} catch {
			return res.status(401).json({ error: 'invalid_token' });
		}
	};
}
