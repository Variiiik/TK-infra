import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import type { JWTPayload, WSMessage } from '@take-control/shared';
import { WS_EVENTS } from '@take-control/shared';
import { config, corsOrigins } from '../config';
import { createModuleLogger } from '../lib/logger';
import {
  setDeviceOnline,
  setDeviceOffline,
  getDeviceSocket,
  redisPub,
  redisSub,
} from '../lib/redis';
import prisma from '../lib/prisma';
import { sessionService } from '../modules/session/session.service';
import { setGatewayEmitter } from '../lib/gateway';

const logger = createModuleLogger('websocket');

interface AuthenticatedSocket extends Socket {
  user?: JWTPayload;
  deviceId?: string;
  sessionIds?: Set<string>;
}

export class SocketGateway {
  private io: Server;

  constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: corsOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 30000,
      pingInterval: 15000,
    });

    this.setupRedisSubscription();
    this.registerHandlers();

    // Register singleton so other services can emit events
    setGatewayEmitter((room, event, data) => this.io.to(room).emit(event, data));
    logger.info('WebSocket gateway initialized');
  }

  private setupRedisSubscription(): void {
    redisSub.subscribe('ws:broadcast', 'ws:direct', (err, count) => {
      if (err) logger.error('Redis subscribe error', { error: err.message });
      else logger.info(`Redis subscribed to ${count} channels`);
    });

    redisSub.on('message', (channel, message) => {
      try {
        const { targetId, event, data } = JSON.parse(message);
        if (channel === 'ws:broadcast' && targetId) {
          this.io.to(targetId).emit(event, data);
        } else if (channel === 'ws:direct') {
          this.io.to(targetId).emit(event, data);
        }
      } catch (err) {
        logger.error('Redis message parse error', { error: err });
      }
    });
  }

  private registerHandlers(): void {
    this.io.use(this.authMiddleware.bind(this));

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      logger.info('Client connected', {
        socketId: socket.id,
        userId: socket.user?.sub,
        role: socket.user?.role,
      });

      socket.sessionIds = new Set();
      socket.join(`user:${socket.user!.sub}`);
      socket.join(`org:${socket.user!.organizationId}`);

      this.handleDeviceRegistration(socket);
      this.handleSessionEvents(socket);
      this.handleRTCSignaling(socket);
      this.handleInputEvents(socket);
      this.handleChatEvents(socket);
      this.handleHeartbeat(socket);

      socket.on('disconnect', (reason) => this.handleDisconnect(socket, reason));
    });
  }

  private authMiddleware(socket: AuthenticatedSocket, next: (err?: Error) => void): void {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
      socket.user = payload;
      next();
    } catch {
      next(new Error('Invalid authentication token'));
    }
  }

  private handleDeviceRegistration(socket: AuthenticatedSocket): void {
    socket.on(WS_EVENTS.DEVICE_REGISTER, async (data: {
      deviceId?: string;
      hostname: string;
      os: string;
      osVersion: string;
      agentVersion: string;
      monitors: object[];
      cpuInfo?: string;
      ramInfo?: string;
    }) => {
      try {
        let device;

        if (data.deviceId) {
          device = await prisma.device.update({
            where: { id: data.deviceId },
            data: {
              status: 'online',
              agentStatus: 'running',
              agentVersion: data.agentVersion,
              ipAddress: socket.handshake.address,
              monitorsJson: JSON.stringify(data.monitors),
              lastSeenAt: new Date(),
            },
          });
        } else {
          device = await prisma.device.create({
            data: {
              name: data.hostname,
              hostname: data.hostname,
              os: data.os as any,
              osVersion: data.osVersion,
              agentVersion: data.agentVersion,
              agentStatus: 'running',
              status: 'online',
              ipAddress: socket.handshake.address,
              userId: socket.user!.sub,
              organizationId: socket.user!.organizationId,
              monitorsJson: JSON.stringify(data.monitors),
              cpuInfo: data.cpuInfo,
              ramInfo: data.ramInfo,
            },
          });
        }

        socket.deviceId = device.id;
        socket.join(`device:${device.id}`);
        await setDeviceOnline(device.id, socket.id);

        this.broadcastToOrg(socket.user!.organizationId, WS_EVENTS.DEVICE_STATUS_CHANGE, {
          deviceId: device.id,
          status: 'online',
        });

        socket.emit(WS_EVENTS.DEVICE_REGISTERED, {
          deviceId: device.id,
          name: device.name,
          status: 'online',
        });

        logger.info('Device registered', { deviceId: device.id, hostname: data.hostname });
      } catch (err) {
        logger.error('Device registration failed', { error: err });
        socket.emit(WS_EVENTS.ERROR, { message: 'Device registration failed' });
      }
    });
  }

  private handleSessionEvents(socket: AuthenticatedSocket): void {
    socket.on(WS_EVENTS.SESSION_START, async (data: { sessionId: string }) => {
      socket.join(`session:${data.sessionId}`);
      socket.sessionIds!.add(data.sessionId);
      logger.info('Socket joined session', { socketId: socket.id, sessionId: data.sessionId });
    });

    socket.on(WS_EVENTS.SESSION_APPROVED, async (data: { sessionId: string }) => {
      try {
        await sessionService.approveSession(data.sessionId, socket.user!.sub);
        this.broadcastToSession(data.sessionId, WS_EVENTS.SESSION_APPROVED, {
          sessionId: data.sessionId,
          approvedBy: socket.user!.sub,
        });
      } catch (err) {
        socket.emit(WS_EVENTS.ERROR, { message: 'Failed to approve session' });
      }
    });

    socket.on(WS_EVENTS.SESSION_REJECTED, async (data: { sessionId: string; reason?: string }) => {
      try {
        await sessionService.rejectSession(data.sessionId, socket.user!.sub, data.reason);
        this.broadcastToSession(data.sessionId, WS_EVENTS.SESSION_REJECTED, {
          sessionId: data.sessionId,
          reason: data.reason,
        });
      } catch (err) {
        socket.emit(WS_EVENTS.ERROR, { message: 'Failed to reject session' });
      }
    });

    socket.on(WS_EVENTS.SESSION_END, async (data: { sessionId: string; reason?: string }) => {
      try {
        await sessionService.endSession(
          data.sessionId,
          socket.user!.sub,
          data.reason ?? 'technician_ended'
        );
        this.broadcastToSession(data.sessionId, WS_EVENTS.SESSION_ENDED, {
          sessionId: data.sessionId,
          reason: data.reason,
        });
        this.broadcastToOrg(socket.user!.organizationId, WS_EVENTS.SESSION_ENDED, {
          sessionId: data.sessionId,
        });
      } catch (err) {
        socket.emit(WS_EVENTS.ERROR, { message: 'Failed to end session' });
      }
    });

    socket.on(WS_EVENTS.SESSION_CONTROL_TRANSFER, async (data: {
      sessionId: string;
      mode: 'view_only' | 'full_control' | 'none';
    }) => {
      try {
        await sessionService.transferControl(data.sessionId, socket.user!.sub, data.mode);
        this.broadcastToSession(data.sessionId, WS_EVENTS.SESSION_CONTROL_TRANSFER, {
          sessionId: data.sessionId,
          mode: data.mode,
          grantedBy: socket.user!.sub,
        });
      } catch (err) {
        socket.emit(WS_EVENTS.ERROR, { message: 'Failed to transfer control' });
      }
    });

    socket.on(WS_EVENTS.SESSION_MONITOR_SWITCH, async (data: {
      sessionId: string;
      monitorId: number;
    }) => {
      await sessionService.switchMonitor(data.sessionId, data.monitorId);
      this.broadcastToSession(data.sessionId, WS_EVENTS.SESSION_MONITOR_SWITCH, data);
    });
  }

  private handleRTCSignaling(socket: AuthenticatedSocket): void {
    socket.on(WS_EVENTS.RTC_OFFER, (data: { sessionId: string; toPeerId: string; signal: object }) => {
      this.io.to(`user:${data.toPeerId}`).emit(WS_EVENTS.RTC_OFFER, {
        ...data,
        fromPeerId: socket.user!.sub,
      });
    });

    socket.on(WS_EVENTS.RTC_ANSWER, (data: { sessionId: string; toPeerId: string; signal: object }) => {
      this.io.to(`user:${data.toPeerId}`).emit(WS_EVENTS.RTC_ANSWER, {
        ...data,
        fromPeerId: socket.user!.sub,
      });
    });

    socket.on(WS_EVENTS.RTC_ICE_CANDIDATE, (data: { sessionId: string; toPeerId: string; candidate: object }) => {
      this.io.to(`user:${data.toPeerId}`).emit(WS_EVENTS.RTC_ICE_CANDIDATE, {
        ...data,
        fromPeerId: socket.user!.sub,
      });
    });
  }

  private handleInputEvents(socket: AuthenticatedSocket): void {
    socket.on(WS_EVENTS.INPUT_MOUSE_MOVE, (data: { sessionId: string; x: number; y: number; monitorId: number }) => {
      this.forwardToDevice(data.sessionId, WS_EVENTS.INPUT_MOUSE_MOVE, data);
    });

    socket.on(WS_EVENTS.INPUT_MOUSE_CLICK, (data: object) => {
      const d = data as any;
      this.forwardToDevice(d.sessionId, WS_EVENTS.INPUT_MOUSE_CLICK, d);
    });

    socket.on(WS_EVENTS.INPUT_MOUSE_SCROLL, (data: object) => {
      const d = data as any;
      this.forwardToDevice(d.sessionId, WS_EVENTS.INPUT_MOUSE_SCROLL, d);
    });

    socket.on(WS_EVENTS.INPUT_KEY_PRESS, (data: object) => {
      const d = data as any;
      this.forwardToDevice(d.sessionId, WS_EVENTS.INPUT_KEY_PRESS, d);
    });

    socket.on(WS_EVENTS.INPUT_KEY_RELEASE, (data: object) => {
      const d = data as any;
      this.forwardToDevice(d.sessionId, WS_EVENTS.INPUT_KEY_RELEASE, d);
    });
  }

  private handleChatEvents(socket: AuthenticatedSocket): void {
    socket.on(WS_EVENTS.CHAT_MESSAGE, async (data: {
      sessionId: string;
      content: string;
      type?: string;
    }) => {
      try {
        const msg = await prisma.chatMessage.create({
          data: {
            sessionId: data.sessionId,
            senderId: socket.user!.sub,
            content: data.content,
            type: data.type ?? 'text',
          },
          include: {
            sender: { select: { id: true, displayName: true, avatarUrl: true, role: true } },
          },
        });
        this.broadcastToSession(data.sessionId, WS_EVENTS.CHAT_MESSAGE, msg);
      } catch (err) {
        socket.emit(WS_EVENTS.ERROR, { message: 'Failed to send message' });
      }
    });

    socket.on(WS_EVENTS.CHAT_TYPING, (data: { sessionId: string; isTyping: boolean }) => {
      socket.to(`session:${data.sessionId}`).emit(WS_EVENTS.CHAT_TYPING, {
        userId: socket.user!.sub,
        ...data,
      });
    });
  }

  private handleHeartbeat(socket: AuthenticatedSocket): void {
    socket.on(WS_EVENTS.HEARTBEAT, async (data: { deviceId?: string }) => {
      if (data.deviceId) {
        await prisma.device.update({
          where: { id: data.deviceId },
          data: { lastSeenAt: new Date() },
        }).catch(() => {});
      }
      socket.emit(WS_EVENTS.HEARTBEAT_ACK, { timestamp: Date.now() });
    });
  }

  private async handleDisconnect(socket: AuthenticatedSocket, reason: string): Promise<void> {
    logger.info('Client disconnected', { socketId: socket.id, reason, userId: socket.user?.sub });

    if (socket.deviceId) {
      await setDeviceOffline(socket.deviceId);
      await prisma.device.update({
        where: { id: socket.deviceId },
        data: { status: 'offline', agentStatus: 'stopped', lastSeenAt: new Date() },
      }).catch(() => {});

      this.broadcastToOrg(socket.user!.organizationId, WS_EVENTS.DEVICE_STATUS_CHANGE, {
        deviceId: socket.deviceId,
        status: 'offline',
      });
    }

    // End active sessions if connection lost
    for (const sessionId of socket.sessionIds ?? []) {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        select: { status: true, technicianId: true },
      }).catch(() => null);

      if (session?.status === 'active') {
        await sessionService.endSession(sessionId, socket.user!.sub, 'connection_lost').catch(() => {});
        this.broadcastToSession(sessionId, WS_EVENTS.SESSION_ENDED, {
          sessionId,
          reason: 'connection_lost',
        });
      }
    }
  }

  private broadcastToSession(sessionId: string, event: string, data: unknown): void {
    this.io.to(`session:${sessionId}`).emit(event, data);
  }

  private broadcastToOrg(orgId: string, event: string, data: unknown): void {
    this.io.to(`org:${orgId}`).emit(event, data);
  }

  private async forwardToDevice(sessionId: string, event: string, data: unknown): Promise<void> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { deviceId: true, status: true, controlMode: true },
    });
    if (!session || session.status !== 'active' || session.controlMode !== 'full_control') return;

    const deviceSocket = await getDeviceSocket(session.deviceId);
    if (deviceSocket) {
      this.io.to(deviceSocket).emit(event, data);
    }
  }

  getIO(): Server {
    return this.io;
  }

  broadcastNotification(userId: string, notification: object): void {
    this.io.to(`user:${userId}`).emit(WS_EVENTS.NOTIFICATION_PUSH, notification);
  }
}
