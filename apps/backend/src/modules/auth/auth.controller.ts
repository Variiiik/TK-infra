import type { Request, Response } from 'express';
import { z } from 'zod';
import { authService } from './auth.service';
import { createApiResponse } from '../../utils/api-error';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

const resetRequestSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    const { email, password } = loginSchema.parse(req.body);
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    const ua = req.headers['user-agent'];
    const result = await authService.login(email, password, ip, ua);
    res.json(createApiResponse(result));
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = refreshSchema.parse(req.body);
    const tokens = await authService.refreshToken(refreshToken);
    res.json(createApiResponse(tokens));
  }

  async logout(req: Request, res: Response): Promise<void> {
    const { refreshToken } = refreshSchema.parse(req.body);
    await authService.logout(req.user!.sub, refreshToken);
    res.json(createApiResponse({ message: 'Logged out successfully' }));
  }

  async me(req: Request, res: Response): Promise<void> {
    const user = await import('../../lib/prisma').then(m =>
      m.default.user.findUnique({
        where: { id: req.user!.sub },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatarUrl: true,
          role: true,
          status: true,
          organizationId: true,
          organization: { select: { id: true, name: true, slug: true, logoUrl: true } },
          lastLoginAt: true,
          createdAt: true,
        },
      })
    );
    res.json(createApiResponse(user));
  }

  async requestPasswordReset(req: Request, res: Response): Promise<void> {
    const { email } = resetRequestSchema.parse(req.body);
    await authService.requestPasswordReset(email);
    res.json(createApiResponse({ message: 'If the email exists, a reset link has been sent' }));
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, password);
    res.json(createApiResponse({ message: 'Password reset successfully' }));
  }
}

export const authController = new AuthController();
