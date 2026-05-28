// ============================================================
// TAKE CONTROL - Core Type Definitions
// Shared across backend, frontend, and desktop agent
// ============================================================

// ─── User & Authentication ────────────────────────────────────────

export type UserRole = 'super_admin' | 'org_admin' | 'technician' | 'user';

export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending_verification';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  status: UserStatus;
  organizationId: string;
  organization?: Organization;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JWTPayload {
  sub: string;
  email: string;
  role: UserRole;
  organizationId: string;
  sessionId?: string;
  iat: number;
  exp: number;
}

// ─── Organization & Multi-tenant ─────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  plan: OrgPlan;
  status: 'active' | 'suspended' | 'trial';
  maxTechnicians: number;
  maxConcurrentSessions: number;
  settings: OrgSettings;
  createdAt: Date;
  updatedAt: Date;
}

export type OrgPlan = 'free' | 'starter' | 'professional' | 'enterprise';

export interface OrgSettings {
  requireSessionApproval: boolean;
  allowFileTransfer: boolean;
  allowChat: boolean;
  allowRecording: boolean;
  sessionTimeout: number;
  allowUnattendedAccess: boolean;
  enforceTwoFactor: boolean;
  whitelistedIPs?: string[];
  customBranding?: {
    primaryColor: string;
    logoUrl: string;
    companyName: string;
  };
}

// ─── Device & Agent ───────────────────────────────────────────────

export type DeviceOS = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';

export type DeviceStatus = 'online' | 'offline' | 'busy' | 'idle' | 'connecting';

export type AgentStatus = 'running' | 'stopped' | 'updating' | 'error';

export interface Device {
  id: string;
  name: string;
  hostname: string;
  os: DeviceOS;
  osVersion: string;
  agentVersion: string;
  agentStatus: AgentStatus;
  status: DeviceStatus;
  ipAddress?: string;
  macAddress?: string;
  userId?: string;
  user?: User;
  organizationId: string;
  lastSeenAt?: Date;
  registeredAt: Date;
  metadata: DeviceMetadata;
}

export interface DeviceMetadata {
  cpu: string;
  ram: string;
  monitors: MonitorInfo[];
  timezone: string;
  locale: string;
}

export interface MonitorInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  isPrimary: boolean;
  scaleFactor: number;
}

// ─── Support Request & Sessions ───────────────────────────────────

export type SessionStatus =
  | 'pending'
  | 'waiting_approval'
  | 'approved'
  | 'active'
  | 'paused'
  | 'ended'
  | 'rejected'
  | 'expired';

export type SessionEndReason =
  | 'technician_ended'
  | 'user_ended'
  | 'timeout'
  | 'connection_lost'
  | 'error'
  | 'rejected';

export type ControlMode = 'view_only' | 'full_control' | 'none';

export interface SupportRequest {
  id: string;
  deviceId: string;
  device?: Device;
  userId: string;
  user?: User;
  organizationId: string;
  status: SessionStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  description?: string;
  technicianId?: string;
  technician?: User;
  sessionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  requestId: string;
  deviceId: string;
  device?: Device;
  technicianId: string;
  technician?: User;
  userId: string;
  user?: User;
  organizationId: string;
  status: SessionStatus;
  controlMode: ControlMode;
  activeMonitorId: number;
  startedAt?: Date;
  endedAt?: Date;
  endReason?: SessionEndReason;
  durationSeconds?: number;
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  technicianIp?: string;
  userIp?: string;
  resolution?: string;
  frameRate?: number;
  quality?: string;
  encryptionMethod: string;
}

// ─── WebSocket Events ─────────────────────────────────────────────

export type WSEventType =
  // Connection events
  | 'connect'
  | 'disconnect'
  | 'authenticate'
  | 'authenticated'
  | 'heartbeat'
  | 'heartbeat_ack'
  // Device events
  | 'device:register'
  | 'device:registered'
  | 'device:status_change'
  | 'device:info_update'
  // Support request events
  | 'request:create'
  | 'request:update'
  | 'request:accept'
  | 'request:reject'
  | 'request:cancel'
  // Session events
  | 'session:start'
  | 'session:started'
  | 'session:end'
  | 'session:ended'
  | 'session:approval_required'
  | 'session:approved'
  | 'session:rejected'
  | 'session:paused'
  | 'session:resumed'
  | 'session:control_transfer'
  | 'session:monitor_switch'
  // Screen sharing (WebRTC signaling)
  | 'rtc:offer'
  | 'rtc:answer'
  | 'rtc:ice_candidate'
  | 'rtc:renegotiate'
  // Input events
  | 'input:mouse_move'
  | 'input:mouse_click'
  | 'input:mouse_scroll'
  | 'input:key_press'
  | 'input:key_release'
  // Chat events
  | 'chat:message'
  | 'chat:typing'
  | 'chat:read'
  // File transfer events
  | 'file:transfer_start'
  | 'file:transfer_progress'
  | 'file:transfer_complete'
  | 'file:transfer_error'
  // Agent events
  | 'agent:restart'
  | 'agent:update'
  | 'agent:status'
  // Notification events
  | 'notification:push'
  | 'error';

export interface WSMessage<T = unknown> {
  event: WSEventType;
  data: T;
  requestId?: string;
  timestamp: number;
}

// ─── WebRTC ───────────────────────────────────────────────────────

export interface RTCSignal {
  sessionId: string;
  fromPeerId: string;
  toPeerId: string;
  signal: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

// ─── Chat ─────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderId: string;
  sender?: Pick<User, 'id' | 'displayName' | 'avatarUrl' | 'role'>;
  content: string;
  type: 'text' | 'system' | 'file';
  fileUrl?: string;
  fileName?: string;
  readAt?: Date;
  createdAt: Date;
}

// ─── Audit Logging ────────────────────────────────────────────────

export type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'session.started'
  | 'session.ended'
  | 'session.control_granted'
  | 'session.control_revoked'
  | 'device.registered'
  | 'device.deleted'
  | 'file.uploaded'
  | 'file.downloaded'
  | 'settings.changed'
  | 'api_key.created'
  | 'api_key.revoked';

export interface AuditLog {
  id: string;
  action: AuditAction;
  actorId: string;
  actor?: Pick<User, 'id' | 'email' | 'displayName'>;
  targetId?: string;
  targetType?: string;
  organizationId: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ─── API Response Types ───────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

// ─── Permissions ──────────────────────────────────────────────────

export type Permission =
  | 'sessions:view'
  | 'sessions:create'
  | 'sessions:end'
  | 'sessions:control'
  | 'devices:view'
  | 'devices:manage'
  | 'users:view'
  | 'users:create'
  | 'users:update'
  | 'users:delete'
  | 'organizations:view'
  | 'organizations:manage'
  | 'audit:view'
  | 'settings:view'
  | 'settings:manage'
  | 'api_keys:view'
  | 'api_keys:manage';

export type RolePermissions = Record<UserRole, Permission[]>;

// ─── Input Events ─────────────────────────────────────────────────

export interface MouseMoveEvent {
  x: number;
  y: number;
  monitorId: number;
}

export interface MouseClickEvent {
  x: number;
  y: number;
  button: 'left' | 'right' | 'middle';
  type: 'down' | 'up' | 'click' | 'double';
  monitorId: number;
}

export interface MouseScrollEvent {
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
  monitorId: number;
}

export interface KeyboardEvent {
  key: string;
  code: string;
  modifiers: {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
  };
}

// ─── Statistics & Analytics ───────────────────────────────────────

export interface DashboardStats {
  activeSessions: number;
  pendingRequests: number;
  onlineDevices: number;
  totalTechnicians: number;
  totalUsers: number;
  sessionsToday: number;
  avgSessionDuration: number;
}

export interface SessionStats {
  totalSessions: number;
  avgDuration: number;
  totalDuration: number;
  byTechnician: Array<{
    technicianId: string;
    technicianName: string;
    count: number;
    avgDuration: number;
  }>;
  byHour: Array<{ hour: number; count: number }>;
  byDay: Array<{ date: string; count: number }>;
}

// ─── Notification ─────────────────────────────────────────────────

export type NotificationType =
  | 'session_request'
  | 'session_started'
  | 'session_ended'
  | 'device_offline'
  | 'device_online'
  | 'update_available'
  | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  userId: string;
  read: boolean;
  data?: Record<string, unknown>;
  createdAt: Date;
}

// ─── Module System ────────────────────────────────────────────────

export interface ModuleDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface EventBusEvent<T = unknown> {
  type: string;
  payload: T;
  source: string;
  timestamp: number;
}
