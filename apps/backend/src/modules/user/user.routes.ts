import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma';
import { authenticate, requirePermission, requireRole } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { createApiResponse, createPaginatedResponse, ApiError } from '../../utils/api-error';

const router = Router();
router.use(authenticate);

// List users (admin only)
router.get('/', requirePermission('users:view'), asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const search = req.query.search as string;

  const where: any = { organizationId: req.user!.organizationId };
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { displayName: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (req.query.role) where.role = req.query.role;
  if (req.query.status) where.status = req.query.status;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  res.json(createPaginatedResponse(users, page, limit, total));
}));

// Get single user
router.get('/:userId', requirePermission('users:view'), asyncHandler(async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { id: req.params.userId, organizationId: req.user!.organizationId },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      displayName: true, avatarUrl: true, role: true, status: true,
      lastLoginAt: true, createdAt: true,
      _count: { select: { technicianSessions: true, devices: true } },
    },
  });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  res.json(createApiResponse(user));
}));

// Create user
router.post('/', requirePermission('users:create'), asyncHandler(async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    password: z.string().min(8),
    role: z.enum(['org_admin', 'technician', 'user']).default('user'),
  });
  const data = schema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new ApiError(409, 'CONFLICT', 'Email already in use');

  const user = await prisma.user.create({
    data: {
      ...data,
      displayName: `${data.firstName} ${data.lastName}`,
      passwordHash: await bcrypt.hash(data.password, 12),
      status: 'active',
      emailVerified: true,
      organizationId: req.user!.organizationId,
    },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      displayName: true, role: true, status: true, createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'user_created',
      actorId: req.user!.sub,
      targetId: user.id,
      targetType: 'User',
      organizationId: req.user!.organizationId,
    },
  });

  res.status(201).json(createApiResponse(user));
}));

// Update user
router.patch('/:userId', requirePermission('users:update'), asyncHandler(async (req, res) => {
  const schema = z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    displayName: z.string().min(1).optional(),
    role: z.enum(['org_admin', 'technician', 'user']).optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
  });
  const data = schema.parse(req.body);

  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data,
    select: {
      id: true, email: true, firstName: true, lastName: true,
      displayName: true, role: true, status: true, updatedAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'user_updated',
      actorId: req.user!.sub,
      targetId: user.id,
      targetType: 'User',
      organizationId: req.user!.organizationId,
      metadataJson: JSON.stringify(data),
    },
  });

  res.json(createApiResponse(user));
}));

// Delete user
router.delete('/:userId', requirePermission('users:delete'), asyncHandler(async (req, res) => {
  if (req.params.userId === req.user!.sub) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Cannot delete your own account');
  }

  await prisma.user.update({
    where: { id: req.params.userId },
    data: { status: 'inactive' },
  });

  await prisma.auditLog.create({
    data: {
      action: 'user_deleted',
      actorId: req.user!.sub,
      targetId: req.params.userId,
      targetType: 'User',
      organizationId: req.user!.organizationId,
    },
  });

  res.json(createApiResponse({ message: 'User deactivated' }));
}));

export default router;
