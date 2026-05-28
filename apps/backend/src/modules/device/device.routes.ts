import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { createApiResponse, createPaginatedResponse, ApiError } from '../../utils/api-error';
import { getOnlineDeviceIds } from '../../lib/redis';

const router = Router();
router.use(authenticate);

// List devices
router.get('/', requirePermission('devices:view'), asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const search = req.query.search as string;

  const where: any = { organizationId: req.user!.organizationId };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { hostname: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (req.query.status) where.status = req.query.status;
  if (req.query.os) where.os = req.query.os;

  const [devices, total] = await Promise.all([
    prisma.device.findMany({
      where, skip, take: limit,
      orderBy: { lastSeenAt: 'desc' },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    }),
    prisma.device.count({ where }),
  ]);

  res.json(createPaginatedResponse(devices, page, limit, total));
}));

// Get single device
router.get('/:deviceId', requirePermission('devices:view'), asyncHandler(async (req, res) => {
  const device = await prisma.device.findFirst({
    where: { id: req.params.deviceId, organizationId: req.user!.organizationId },
    include: {
      user: { select: { id: true, displayName: true, email: true } },
      sessions: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, startedAt: true, endedAt: true, durationSeconds: true },
      },
    },
  });
  if (!device) throw new ApiError(404, 'NOT_FOUND', 'Device not found');
  res.json(createApiResponse(device));
}));

// Online device IDs
router.get('/status/online', requirePermission('devices:view'), asyncHandler(async (req, res) => {
  const ids = await getOnlineDeviceIds();
  res.json(createApiResponse({ onlineDeviceIds: ids }));
}));

// Update device name
router.patch('/:deviceId', requirePermission('devices:manage'), asyncHandler(async (req, res) => {
  const schema = z.object({ name: z.string().min(1).max(100) });
  const { name } = schema.parse(req.body);
  const device = await prisma.device.update({
    where: { id: req.params.deviceId },
    data: { name },
    select: { id: true, name: true, updatedAt: true },
  });
  res.json(createApiResponse(device));
}));

// Delete device — cascade through related records
router.delete('/:deviceId', requirePermission('devices:manage'), asyncHandler(async (req, res) => {
  const { deviceId } = req.params;

  await prisma.$transaction(async (tx) => {
    // Find sessions for this device
    const sessions = await tx.session.findMany({
      where: { deviceId },
      select: { id: true },
    });
    const sessionIds = sessions.map(s => s.id);

    // Delete session children
    if (sessionIds.length) {
      await tx.chatMessage.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.fileTransfer.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.sessionRecording.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.session.deleteMany({ where: { id: { in: sessionIds } } });
    }

    // Delete support requests
    await tx.supportRequest.deleteMany({ where: { deviceId } });

    // Delete device
    await tx.device.delete({ where: { id: deviceId } });
  });

  await prisma.auditLog.create({
    data: {
      action: 'device_deleted',
      actorId: req.user!.sub,
      targetId: deviceId,
      targetType: 'Device',
      organizationId: req.user!.organizationId,
    },
  });

  res.json(createApiResponse({ message: 'Device removed' }));
}));

export default router;
