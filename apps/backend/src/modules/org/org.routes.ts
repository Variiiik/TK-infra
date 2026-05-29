import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { createApiResponse, ApiError } from '../../utils/api-error';

const router = Router();
router.use(authenticate);

const orgSettingsSelect = {
  id: true,
  name: true,
  requireSessionApproval: true,
  allowFileTransfer: true,
  allowChat: true,
  allowRecording: true,
  sessionTimeoutMinutes: true,
  allowUnattendedAccess: true,
  enforceTwoFactor: true,
} as const;

router.get('/settings', requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.user!.organizationId },
    select: orgSettingsSelect,
  });
  if (!org) throw new ApiError(404, 'NOT_FOUND', 'Organization not found');
  res.json(createApiResponse(org));
}));

router.patch('/settings', requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    requireSessionApproval: z.boolean().optional(),
    allowFileTransfer: z.boolean().optional(),
    allowChat: z.boolean().optional(),
    allowRecording: z.boolean().optional(),
    sessionTimeoutMinutes: z.number().int().min(5).max(480).optional(),
    allowUnattendedAccess: z.boolean().optional(),
    enforceTwoFactor: z.boolean().optional(),
  });
  const data = schema.parse(req.body);

  const org = await prisma.organization.update({
    where: { id: req.user!.organizationId },
    data,
    select: orgSettingsSelect,
  });

  await prisma.auditLog.create({
    data: {
      action: 'settings_changed',
      actorId: req.user!.sub,
      targetId: org.id,
      targetType: 'Organization',
      organizationId: req.user!.organizationId,
      metadataJson: JSON.stringify(data),
    },
  });

  res.json(createApiResponse(org));
}));

export default router;
