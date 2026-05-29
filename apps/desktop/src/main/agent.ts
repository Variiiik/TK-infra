import { io, Socket } from 'socket.io-client';
import https from 'https';
import http from 'http';
import os from 'os';
import { screen } from 'electron';
import { WS_EVENTS, AGENT } from '@take-control/shared';
import type { MonitorInfo } from '@take-control/shared';
import { AgentLogger } from './logger';
import { InputService } from './input-service';

interface AgentConfig {
  serverUrl: string;
  orgToken: string;                              // JWT or "email:password"
  savedDeviceId?: string;                        // Persisted from previous run
  onStatusChange?: (status: string) => void;
  onSessionRequest?: (data: unknown) => void;
  onSessionStart?: (session: unknown) => void;
  onSessionEnd?: (reason: string) => void;
  onControlChange?: (mode: string) => void;
  onDeviceRegistered?: (deviceId: string) => void;
  // IPC bridge to renderer for WebRTC (browser APIs not available in Node.js)
  sendToRenderer?: (channel: string, data: unknown) => void;
}

interface AgentState {
  status: 'running' | 'stopped' | 'connecting' | 'error';
  deviceId?: string;
  sessionId?: string;
  controlMode: 'none' | 'view_only' | 'full_control';
}

export class TakeControlAgent {
  private socket: Socket | null = null;
  private inputService: InputService;
  private logger: AgentLogger;
  private config: AgentConfig;
  private state: AgentState = { status: 'stopped', controlMode: 'none' };
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(config: AgentConfig) {
    this.config = config;
    this.logger = new AgentLogger();
    this.inputService = new InputService();
    // Restore persisted deviceId immediately
    if (config.savedDeviceId) {
      this.state.deviceId = config.savedDeviceId;
    }
  }

  async start(): Promise<void> {
    this.logger.info('Starting TakeControl Agent...');
    this.setState({ status: 'connecting' });

    const token = this.config.orgToken;
    if (token && token.includes(':') && !token.startsWith('ey')) {
      const [email, ...rest] = token.split(':');
      try {
        this.config.orgToken = await this.loginAndGetToken(email, rest.join(':'));
        this.logger.info('Authenticated', { email });
      } catch (err) {
        this.logger.error('Authentication failed', err);
        this.setState({ status: 'error' });
        return;
      }
    }

    this.connect();
  }

  stop(): void {
    this.clearHeartbeat();
    this.socket?.disconnect();
    this.socket = null;
    this.setState({ status: 'stopped' });
  }

  restart(): void {
    this.stop();
    setTimeout(() => this.start(), 1000);
  }

  getStatus(): string { return this.state.status; }

  getDeviceInfo() {
    return {
      deviceId:  this.state.deviceId,
      hostname:  os.hostname(),
      os:        this.getOSType(),
      osVersion: `${os.type()} ${os.release()}`,
      username:  os.userInfo().username,
      cpuInfo:   os.cpus()[0]?.model ?? 'Unknown',
      ramInfo:   `${Math.round(os.totalmem() / 1073741824)} GB`,
    };
  }

  getActiveSession() {
    return this.state.sessionId
      ? { sessionId: this.state.sessionId, controlMode: this.state.controlMode }
      : null;
  }

  approveSession(sessionId: string): void {
    this.socket?.emit(WS_EVENTS.SESSION_APPROVED, { sessionId });
  }

  rejectSession(sessionId: string, reason?: string): void {
    this.socket?.emit(WS_EVENTS.SESSION_REJECTED, { sessionId, reason });
  }

  endSession(sessionId: string): void {
    this.socket?.emit(WS_EVENTS.SESSION_END, { sessionId, reason: 'user_ended' });
    this.cleanupSession();
  }

  revokeControl(): void {
    if (!this.state.sessionId) return;
    this.socket?.emit(WS_EVENTS.SESSION_CONTROL_TRANSFER, {
      sessionId: this.state.sessionId,
      mode: 'view_only',
    });
  }

  // Called by IPC handler when renderer sends WebRTC signals back
  sendRtcSignal(event: string, data: unknown): void {
    this.socket?.emit(event, data);
  }

  private connect(): void {
    this.socket = io(this.config.serverUrl, {
      auth: { token: this.config.orgToken, isAgent: true },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: AGENT.MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: AGENT.RECONNECT_DELAY_MS,
      timeout: 10000,
    });

    this.socket.on('connect',       this.handleConnect.bind(this));
    this.socket.on('disconnect',    this.handleDisconnect.bind(this));
    this.socket.on('connect_error', this.handleConnectError.bind(this));
    this.registerEventHandlers();
  }

  private async handleConnect(): Promise<void> {
    this.logger.info('Connected to server');
    const info     = this.getDeviceInfo();
    const monitors = this.getMonitors();

    this.socket!.emit(WS_EVENTS.DEVICE_REGISTER, {
      deviceId:     this.state.deviceId,   // null on first run → server creates new
      hostname:     info.hostname,
      os:           info.os,
      osVersion:    info.osVersion,
      agentVersion: AGENT.CURRENT_VERSION,
      monitors,
      cpuInfo:      info.cpuInfo,
      ramInfo:      info.ramInfo,
    });

    this.startHeartbeat();
    this.setState({ status: 'running' });
  }

  private handleDisconnect(reason: string): void {
    this.logger.warn('Disconnected', { reason });
    this.clearHeartbeat();
    if (this.state.sessionId) {
      this.cleanupSession();
      this.config.onSessionEnd?.('connection_lost');
    }
    this.setState({ status: 'connecting' });
  }

  private handleConnectError(error: Error): void {
    this.logger.error('Connection error', error);
    this.setState({ status: 'error' });
  }

  private registerEventHandlers(): void {
    const socket = this.socket!;

    socket.on(WS_EVENTS.DEVICE_REGISTERED, (data: any) => {
      this.logger.info('Device registered', { deviceId: data.deviceId });
      this.state.deviceId = data.deviceId;
      this.config.onDeviceRegistered?.(data.deviceId);  // persist to disk
    });

    socket.on(WS_EVENTS.SESSION_APPROVAL_REQUIRED, (data: any) => {
      this.logger.info('Session approval required', { sessionId: data.sessionId });
      this.config.onSessionRequest?.(data);
    });

    socket.on(WS_EVENTS.SESSION_APPROVED, (data: any) => {
      this.logger.info('Session approved', { sessionId: data.sessionId });
      this.state.sessionId = data.sessionId;
      // Tell renderer to start WebRTC (RTCPeerConnection only works in browser context)
      this.config.sendToRenderer?.('rtc:session-start', data);
      this.config.onSessionStart?.(data);
    });

    socket.on(WS_EVENTS.SESSION_ENDED, (data: any) => {
      this.logger.info('Session ended', data);
      this.cleanupSession();
      this.config.sendToRenderer?.('rtc:session-end', data);
      this.config.onSessionEnd?.(data.reason ?? 'technician_ended');
    });

    socket.on(WS_EVENTS.SESSION_CONTROL_TRANSFER, (data: any) => {
      this.logger.info('Control transfer received', { mode: data.mode, sessionId: data.sessionId });
      this.state.controlMode = data.mode;
      this.config.onControlChange?.(data.mode);
    });

    // ─── WebRTC signals: forward to renderer (browser has RTCPeerConnection) ──
    socket.on(WS_EVENTS.RTC_OFFER, (data: any) => {
      this.config.sendToRenderer?.('rtc:offer', data);
    });

    socket.on(WS_EVENTS.RTC_ANSWER, (data: any) => {
      this.config.sendToRenderer?.('rtc:answer', data);
    });

    socket.on(WS_EVENTS.RTC_ICE_CANDIDATE, (data: any) => {
      this.config.sendToRenderer?.('rtc:ice-candidate', data);
    });

    // ─── Input events: handled in Node.js via PowerShell/xdotool ────────────
    socket.on(WS_EVENTS.INPUT_MOUSE_MOVE, (data: any) => {
      if (this.state.controlMode !== 'full_control') return;
      this.inputService.moveMouse(data.x, data.y);
    });

    socket.on(WS_EVENTS.INPUT_MOUSE_CLICK, (data: any) => {
      if (this.state.controlMode !== 'full_control') return;
      this.inputService.mouseClick(data.x, data.y, data.button, data.type);
    });

    socket.on(WS_EVENTS.INPUT_MOUSE_SCROLL, (data: any) => {
      if (this.state.controlMode !== 'full_control') return;
      this.inputService.scroll(data.x, data.y, data.deltaX, data.deltaY);
    });

    socket.on(WS_EVENTS.INPUT_KEY_PRESS, (data: any) => {
      if (this.state.controlMode !== 'full_control') return;
      this.inputService.keyPress(data.key, data.modifiers);
    });

    socket.on(WS_EVENTS.SESSION_MONITOR_SWITCH, (data: any) => {
      this.config.sendToRenderer?.('rtc:switch-monitor', { monitorId: data.monitorId });
    });

    socket.on(WS_EVENTS.AGENT_RESTART, () => this.restart());
  }

  private getMonitors(): MonitorInfo[] {
    try {
      const displays = screen.getAllDisplays();
      const primary = screen.getPrimaryDisplay();
      return displays.map((d, i) => ({
        id: i,
        name: `Monitor ${i + 1}`,
        width: d.size.width,
        height: d.size.height,
        isPrimary: d.id === primary.id,
        scaleFactor: d.scaleFactor,
      }));
    } catch {
      return [{ id: 0, name: 'Primary Monitor', width: 1920, height: 1080, isPrimary: true, scaleFactor: 1 }];
    }
  }

  private getOSType(): string {
    const p = process.platform;
    return p === 'win32' ? 'windows' : p === 'darwin' ? 'macos' : p === 'linux' ? 'linux' : 'unknown';
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.socket?.emit(WS_EVENTS.HEARTBEAT, { deviceId: this.state.deviceId });
    }, AGENT.HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeat(): void {
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = undefined;
  }

  private cleanupSession(): void {
    this.state.sessionId    = undefined;
    this.state.controlMode  = 'none';
  }

  private setState(partial: Partial<AgentState>): void {
    this.state = { ...this.state, ...partial };
    if (partial.status) this.config.onStatusChange?.(partial.status);
  }

  private loginAndGetToken(email: string, password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ email, password });
      const url  = new URL('/api/v1/auth/login', this.config.serverUrl);
      const mod  = url.protocol === 'https:' ? https : http;
      const req  = mod.request({
        hostname: url.hostname,
        port:     Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout:  10000,
      }, (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.success && j.data?.accessToken) resolve(j.data.accessToken);
            else reject(new Error(j.error?.message ?? 'Login failed'));
          } catch { reject(new Error('Invalid login response')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Login timeout')); });
      req.write(body);
      req.end();
    });
  }
}
