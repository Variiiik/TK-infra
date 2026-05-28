import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JWTPayload, UserRole, Permission } from '@take-control/shared';
import { ROLE_PERMISSIONS, ERROR_CODES, HTTP_STATUS } from '@take-control/shared';
import { config } from '../config';
import { redis } from '../lib/redis';
import { ApiError } from '../utils/api-error';

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'No token provided');
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_EXPIRED, 'Token expired');
    }
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_INVALID, 'Invalid token');
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not authenticated');
    }
    if (!roles.includes(req.user.role)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Insufficient role');
    }
    next();
  };
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not authenticated');
    }
    const permissions = ROLE_PERMISSIONS[req.user.role] ?? [];
    if (!permissions.includes(permission)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, `Missing permission: ${permission}`);
    }
    next();
  };
}

export function requireSameOrg(req: Request, res: Response, next: NextFunction): void {
  const orgId = req.params.orgId || req.body?.organizationId;
  if (orgId && req.user?.role !== 'super_admin' && req.user?.organizationId !== orgId) {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Organization mismatch');
  }
  next();
}

export async function checkTokenRevoked(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) return next();
  const revoked = await redis.get(`revoked:token:${req.user.sub}`);
  if (revoked) {
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_INVALID, 'Token revoked');
  }
  next();
}
