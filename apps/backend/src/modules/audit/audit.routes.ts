import { Router } from 'express';
import prisma from '../../lib/prisma';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { createPaginatedResponse } from '../../utils/api-error';

const router = Router();
router.use(authenticate, requirePermission('audit:view'));

router.get('/', asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const where: any = { organizationId: req.user!.organizationId };
  if (req.query.actorId) where.actorId = req.query.actorId;
  if (req.query.action) where.action = req.query.action;
  if (req.query.from) where.createdAt = { ...where.createdAt, gte: new Date(req.query.from as string) };
  if (req.query.to) where.createdAt = { ...where.createdAt, lte: new Date(req.query.to as string) };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, displayName: true, email: true, role: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json(createPaginatedResponse(logs, page, limit, total));
}));

export default router;
