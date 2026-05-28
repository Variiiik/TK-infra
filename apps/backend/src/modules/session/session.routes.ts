import { Router } from 'express';
import { z } from 'zod';
import { sessionService } from './session.service';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { createApiResponse, createPaginatedResponse } from '../../utils/api-error';

const router = Router();

router.use(authenticate);

// Dashboard stats
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await sessionService.getDashboardStats(req.user!.organizationId);
  res.json(createApiResponse(stats));
}));

// List sessions
router.get('/', requirePermission('sessions:view'), asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await sessionService.listSessions(req.user!.organizationId, {
    status: req.query.status as string,
    technicianId: req.user!.role === 'technician' ? req.user!.sub : undefined,
    page,
    limit,
  });
  res.json(createPaginatedResponse(result.sessions, result.page, result.limit, result.total));
}));

// Pending requests
router.get('/requests/pending', requirePermission('sessions:view'), asyncHandler(async (req, res) => {
  const requests = await sessionService.getPendingRequests(req.user!.organizationId);
  res.json(createApiResponse(requests));
}));

// Create support request
router.post('/requests', requirePermission('sessions:create'), asyncHandler(async (req, res) => {
  const schema = z.object({
    deviceId: z.string(),
    description: z.string().optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  });
  const { deviceId, description, priority } = schema.parse(req.body);
  const request = await sessionService.createRequest(
    deviceId,
    req.user!.sub,
    req.user!.organizationId,
    description,
    priority
  );
  res.status(201).json(createApiResponse(request));
}));

// Accept request (technician)
router.post('/requests/:requestId/accept', requirePermission('sessions:create'), asyncHandler(async (req, res) => {
  const session = await sessionService.acceptRequest(req.params.requestId, req.user!.sub);
  res.json(createApiResponse(session));
}));

// Get session
router.get('/:sessionId', requirePermission('sessions:view'), asyncHandler(async (req, res) => {
  const session = await sessionService.getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
    return;
  }
  res.json(createApiResponse(session));
}));

// Approve session (user)
router.post('/:sessionId/approve', asyncHandler(async (req, res) => {
  await sessionService.approveSession(req.params.sessionId, req.user!.sub);
  res.json(createApiResponse({ message: 'Session approved' }));
}));

// Reject session
router.post('/:sessionId/reject', asyncHandler(async (req, res) => {
  const schema = z.object({ reason: z.string().optional() });
  const { reason } = schema.parse(req.body);
  await sessionService.rejectSession(req.params.sessionId, req.user!.sub, reason);
  res.json(createApiResponse({ message: 'Session rejected' }));
}));

// End session
router.post('/:sessionId/end', requirePermission('sessions:end'), asyncHandler(async (req, res) => {
  const schema = z.object({ reason: z.enum(['technician_ended', 'user_ended', 'timeout']).optional() });
  const { reason = 'technician_ended' } = schema.parse(req.body);
  await sessionService.endSession(req.params.sessionId, req.user!.sub, reason);
  res.json(createApiResponse({ message: 'Session ended' }));
}));

// Transfer control
router.post('/:sessionId/control', requirePermission('sessions:control'), asyncHandler(async (req, res) => {
  const schema = z.object({ mode: z.enum(['view_only', 'full_control', 'none']) });
  const { mode } = schema.parse(req.body);
  const result = await sessionService.transferControl(req.params.sessionId, req.user!.sub, mode);
  res.json(createApiResponse(result));
}));

// Switch monitor
router.post('/:sessionId/monitor', requirePermission('sessions:control'), asyncHandler(async (req, res) => {
  const schema = z.object({ monitorId: z.number().min(0) });
  const { monitorId } = schema.parse(req.body);
  await sessionService.switchMonitor(req.params.sessionId, monitorId);
  res.json(createApiResponse({ monitorId }));
}));

export default router;
