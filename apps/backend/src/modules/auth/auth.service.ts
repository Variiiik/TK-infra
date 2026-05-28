import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type { JWTPayload, AuthTokens } from '@take-control/shared';
import { config } from '../../config';
import prisma from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { ApiError } from '../../utils/api-error';
import { createModuleLogger } from '../../lib/logger';

const logger = createModuleLogger('auth');

export class AuthService {
  async login(email: string, password: string, ipAddress?: string, userAgent?: string): Promise<AuthTokens & { user: object }> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { organization: { select: { id: true, name: true, slug: true, status: true } } },
    });

    if (!user) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    if (user.status !== 'active') {
      throw new ApiError(401, 'ACCOUNT_DISABLED', `Account is ${user.status}`);
    }

    if (user.organization.status === 'suspended') {
      throw new ApiError(403, 'ORG_SUSPENDED', 'Organization account is suspended');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role, user.organizationId);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIP: ipAddress },
    });

    await prisma.auditLog.create({
      data: {
        action: 'user_login',
        actorId: user.id,
        organizationId: user.organizationId,
        ipAddress,
        userAgent,
      },
    });

    logger.info('User logged in', { userId: user.id, email: user.email });

    const { passwordHash, twoFactorSecret, ...safeUser } = user;
    return { ...tokens, user: safeUser };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    let payload: JWTPayload;
    try {
      payload = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET) as JWTPayload;
    } catch {
      throw new ApiError(401, 'TOKEN_INVALID', 'Invalid refresh token');
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new ApiError(401, 'TOKEN_INVALID', 'Refresh token not found or expired');
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens(payload.sub, payload.email, payload.role, payload.organizationId);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, token: refreshToken },
      data: { revokedAt: new Date() },
    });

    await redis.setex(`revoked:token:${userId}`, 900, '1');

    await prisma.auditLog.create({
      data: {
        action: 'user_logout',
        actorId: userId,
        organizationId: (await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } }))!.organizationId,
      },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await redis.setex(`revoked:token:${userId}`, 900, '1');
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    organizationId: string
  ): Promise<AuthTokens> {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      sub: userId,
      email,
      role: role as JWTPayload['role'],
      organizationId,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accessToken = jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN as any,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refreshToken = jwt.sign(payload, config.JWT_REFRESH_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN as any,
    });

    const expiresInMs = 15 * 60 * 1000;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt,
      },
    });

    return { accessToken, refreshToken, expiresIn: expiresInMs };
  }

  async verifyEmail(token: string): Promise<void> {
    const cached = await redis.get(`email:verify:${token}`);
    if (!cached) {
      throw new ApiError(400, 'TOKEN_INVALID', 'Verification token expired or invalid');
    }

    const userId = cached;
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, status: 'active' },
    });
    await redis.del(`email:verify:${token}`);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const token = uuidv4();
    await redis.setex(`pwd:reset:${token}`, 3600, user.id);
    logger.info('Password reset requested', { email, token });
    // In production: send email with reset link
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userId = await redis.get(`pwd:reset:${token}`);
    if (!userId) {
      throw new ApiError(400, 'TOKEN_INVALID', 'Reset token expired or invalid');
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
    await redis.del(`pwd:reset:${token}`);
    await this.logoutAll(userId);
  }
}

export const authService = new AuthService();
