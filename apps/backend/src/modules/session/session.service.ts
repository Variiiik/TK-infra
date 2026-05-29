import type { ControlMode } from '@take-control/shared';
import { WS_EVENTS } from '@take-control/shared';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ApiError } from '../../utils/api-error';
import { createModuleLogger } from '../../lib/logger';
import { setDeviceOnline, setDeviceOffline, getDeviceSocket } from '../../lib/redis';
import { emitToUser } from '../../lib/gateway';

const logger = createModuleLogger('session');

export class SessionService {
  async createRequest(
    deviceId: string,
    userId: string,
    organizationId: string,
    description?: string,
    priority?: string
  ) {
    const device = await prisma.device.findFirst({
      where: { id: deviceId, organizationId },
    });

    if (!device) {
      throw new ApiError(404, 'DEVICE_NOT_FOUND', 'Device not found');
    }

    if (device.status === 'busy') {
      throw new ApiError(409, 'DEVICE_BUSY', 'Device is already in a session');
    }

    const request = await prisma.supportRequest.create({
      data: {
        deviceId,
        userId,
        organizationId,
        description,
        priority: (priority as any) ?? 'normal',
        status: 'pending',
      },
      include: {
        device: { select: { id: true, name: true, hostname: true, os: true, status: true } },
        user: { select: { id: true, displayName: true, email: true } },
      },
    });

    logger.info('Support request created', { requestId: request.id, deviceId, userId });
    return request;
  }

  async acceptRequest(requestId: string, technicianId: string) {
    const request = await prisma.supportRequest.findUnique({
      where: { id: requestId },
      include: { device: true, user: true },
    });

    if (!request) throw new ApiError(404, 'REQUEST_NOT_FOUND', 'Support request not found');
    if (request.status !== 'pending') {
      throw new ApiError(409, 'REQUEST_CONFLICT', `Request is already ${request.status}`);
    }

    const technician = await prisma.user.findUnique({ where: { id: technicianId } });
    if (!technician) throw new ApiError(404, 'USER_NOT_FOUND', 'Technician not found');

    const org = await prisma.organization.findUnique({ where: { id: request.organizationId } });
    const needsApproval = org?.requireSessionApproval ?? true;
    const sessionStatus = needsApproval ? 'waiting_approval' : 'active';

    const session = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.supportRequest.update({
        where: { id: requestId },
        data: { status: needsApproval ? 'waiting_approval' : 'active', technicianId },
      });

      const sess = await tx.session.create({
        data: {
          requestId,
          deviceId: request.deviceId,
          technicianId,
          userId: request.userId,
          organizationId: request.organizationId,
          status: sessionStatus,
          controlMode: 'none',
          encryptionMethod: 'AES-256-GCM',
          // When approval is not required, session starts immediately
          startedAt: needsApproval ? undefined : new Date(),
          approvedAt: needsApproval ? undefined : new Date(),
        },
        include: {
          device: true,
          technician: { select: { id: true, displayName: true, avatarUrl: true } },
          user: { select: { id: true, displayName: true, email: true } },
        },
      });

      await tx.device.update({
        where: { id: request.deviceId },
        data: { status: 'busy' },
      });

      return sess;
    });

    // When no approval needed, notify the agent so it can prepare WebRTC
    if (!needsApproval && session.device?.userId) {
      emitToUser(session.device.userId, WS_EVENTS.SESSION_APPROVED, {
        sessionId: session.id,
        technicianId,
        technician: session.technician,
      });
    }

    logger.info('Session created', { sessionId: session.id, technicianId, status: sessionStatus });
    return session;
  }

  async approveSession(sessionId: string, userId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { technician: { select: { id: true, displayName: true } } },
    });

    if (!session) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found');
    if (session.userId !== userId) throw new ApiError(403, 'FORBIDDEN', 'Not authorized');
    if (session.status !== 'waiting_approval') {
      throw new ApiError(409, 'SESSION_CONFLICT', 'Session is not waiting for approval');
    }

    await prisma.$transaction([
      prisma.session.update({
        where: { id: sessionId },
        data: { status: 'active', startedAt: new Date(), approvedAt: new Date() },
      }),
      prisma.supportRequest.update({
        where: { id: session.requestId },
        data: { status: 'active' },
      }),
    ]);

    await prisma.auditLog.create({
      data: {
        action: 'session_started',
        actorId: userId,
        targetId: sessionId,
        targetType: 'Session',
        organizationId: session.organizationId,
      },
    });

    logger.info('Session approved and started', { sessionId });
    return { sessionId, status: 'active' };
  }

  async rejectSession(sessionId: string, userId: string, reason?: string) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found');
    if (session.userId !== userId && session.technicianId !== userId) {
      throw new ApiError(403, 'FORBIDDEN', 'Not authorized');
    }

    await prisma.$transaction([
      prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'rejected',
          endedAt: new Date(),
          endReason: 'rejected',
          rejectedAt: new Date(),
          rejectionReason: reason,
        },
      }),
      prisma.supportRequest.update({
        where: { id: session.requestId },
        data: { status: 'rejected' },
      }),
      prisma.device.update({
        where: { id: session.deviceId },
        data: { status: 'online' },
      }),
    ]);

    logger.info('Session rejected', { sessionId, reason });
  }

  async endSession(sessionId: string, endedBy: string, reason: string) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found');

    const durationSeconds = session.startedAt
      ? Math.floor((Date.now() - session.startedAt.getTime()) / 1000)
      : 0;

    await prisma.$transaction([
      prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'ended',
          endedAt: new Date(),
          endReason: reason as any,
          durationSeconds,
          controlMode: 'none',
        },
      }),
      prisma.supportRequest.update({
        where: { id: session.requestId },
        data: { status: 'ended' },
      }),
      prisma.device.update({
        where: { id: session.deviceId },
        data: { status: 'online' },
      }),
    ]);

    await prisma.auditLog.create({
      data: {
        action: 'session_ended',
        actorId: endedBy,
        targetId: sessionId,
        targetType: 'Session',
        organizationId: session.organizationId,
        metadataJson: JSON.stringify({ durationSeconds, reason }),
      },
    });

    // Notify agent and technician via WebSocket (REST callers bypass the socket gateway)
    const payload = { sessionId, reason };
    emitToUser(session.userId, WS_EVENTS.SESSION_ENDED, payload);
    if (session.technicianId !== session.userId) {
      emitToUser(session.technicianId, WS_EVENTS.SESSION_ENDED, payload);
    }

    logger.info('Session ended', { sessionId, durationSeconds });
  }

  async transferControl(sessionId: string, requesterId: string, mode: ControlMode) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found');
    if (session.status !== 'active') throw new ApiError(409, 'SESSION_NOT_ACTIVE', 'Session is not active');

    if (requesterId !== session.technicianId && requesterId !== session.userId) {
      throw new ApiError(403, 'FORBIDDEN', 'Not part of this session');
    }

    await prisma.session.update({ where: { id: sessionId }, data: { controlMode: mode } });

    const action = mode === 'full_control' ? 'session_control_granted' : 'session_control_revoked';
    await prisma.auditLog.create({
      data: {
        action,
        actorId: requesterId,
        targetId: sessionId,
        targetType: 'Session',
        organizationId: session.organizationId,
      },
    });

    // Notify agent and all session participants via WebSocket
    const payload = { sessionId, mode };
    emitToUser(session.userId, WS_EVENTS.SESSION_CONTROL_TRANSFER, payload);
    if (session.technicianId !== session.userId) {
      emitToUser(session.technicianId, WS_EVENTS.SESSION_CONTROL_TRANSFER, payload);
    }

    logger.info('Control transferred', { sessionId, mode });
    return { sessionId, controlMode: mode };
  }

  async switchMonitor(sessionId: string, monitorId: number) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return;

    await prisma.session.update({
      where: { id: sessionId },
      data: { activeMonitorId: monitorId },
    });

    // Tell the agent to switch the captured screen
    emitToUser(session.userId, WS_EVENTS.SESSION_MONITOR_SWITCH, { sessionId, monitorId });
  }

  async getSession(sessionId: string) {
    return prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        device: true,
        technician: { select: { id: true, displayName: true, avatarUrl: true, email: true } },
        user: { select: { id: true, displayName: true, email: true } },
        chatMessages: { orderBy: { createdAt: 'asc' }, take: 100 },
      },
    });
  }

  async listSessions(organizationId: string, filters: {
    status?: string;
    technicianId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };
    if (filters.status) where.status = filters.status;
    if (filters.technicianId) where.technicianId = filters.technicianId;

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          device: { select: { id: true, name: true, os: true } },
          technician: { select: { id: true, displayName: true } },
          user: { select: { id: true, displayName: true } },
        },
      }),
      prisma.session.count({ where }),
    ]);

    return { sessions, total, page, limit };
  }

  async getPendingRequests(organizationId: string) {
    return prisma.supportRequest.findMany({
      where: { organizationId, status: 'pending' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      include: {
        device: { select: { id: true, name: true, hostname: true, os: true, osVersion: true, ipAddress: true, status: true } },
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  async getDashboardStats(organizationId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      activeSessions,
      pendingRequests,
      onlineDevices,
      sessionsToday,
      techniciansCount,
    ] = await Promise.all([
      prisma.session.count({ where: { organizationId, status: 'active' } }),
      prisma.supportRequest.count({ where: { organizationId, status: 'pending' } }),
      prisma.device.count({ where: { organizationId, status: 'online' } }),
      prisma.session.count({ where: { organizationId, createdAt: { gte: todayStart } } }),
      prisma.user.count({ where: { organizationId, role: 'technician', status: 'active' } }),
    ]);

    const avgDurationResult = await prisma.session.aggregate({
      where: { organizationId, status: 'ended', durationSeconds: { not: null } },
      _avg: { durationSeconds: true },
    });

    return {
      activeSessions,
      pendingRequests,
      onlineDevices,
      sessionsToday,
      totalTechnicians: techniciansCount,
      avgSessionDuration: Math.round(avgDurationResult._avg.durationSeconds ?? 0),
    };
  }
}

export const sessionService = new SessionService();
