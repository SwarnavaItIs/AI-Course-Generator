import { auth } from 'express-oauth2-jwt-bearer';
import type { Request } from 'express';
import type { Config } from './config.js';
import { ApiError } from './errors.js';

export const createAuth = (config: Config) =>
  auth({
    issuerBaseURL: `https://${config.AUTH0_DOMAIN}/`,
    audience: config.AUTH0_AUDIENCE,
    tokenSigningAlg: 'RS256',
    authRequired: true,
  });
export function ownerFrom(request: Request): string {
  const sub = request.auth?.payload.sub;
  if (typeof sub !== 'string' || sub.length === 0 || sub.length > 256) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }
  return sub;
}
