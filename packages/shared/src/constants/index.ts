import type { RolePermissions } from '../types';

// ─── WebSocket Events ─────────────────────────────────────────────

export const WS_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',
  HEARTBEAT: 'heartbeat',
  HEARTBEAT_ACK: 'heartbeat_ack',

  DEVICE_REGISTER: 'device:register',
  DEVICE_REGISTERED: 'device:registered',
  DEVICE_STATUS_CHANGE: 'device:status_change',
  DEVICE_INFO_UPDATE: 'device:info_update',

  REQUEST_CREATE: 'request:create',
  REQUEST_UPDATE: 'request:update',
  REQUEST_ACCEPT: 'request:accept',
  REQUEST_REJECT: 'request:reject',
  REQUEST_CANCEL: 'request:cancel',

  SESSION_START: 'session:start',
  SESSION_STARTED: 'session:started',
  SESSION_END: 'session:end',
  SESSION_ENDED: 'session:ended',
  SESSION_APPROVAL_REQUIRED: 'session:approval_required',
  SESSION_APPROVED: 'session:approved',
  SESSION_REJECTED: 'session:rejected',
  SESSION_PAUSED: 'session:paused',
  SESSION_RESUMED: 'session:resumed',
  SESSION_CONTROL_TRANSFER: 'session:control_transfer',
  SESSION_MONITOR_SWITCH: 'session:monitor_switch',

  RTC_OFFER: 'rtc:offer',
  RTC_ANSWER: 'rtc:answer',
  RTC_ICE_CANDIDATE: 'rtc:ice_candidate',
  RTC_RENEGOTIATE: 'rtc:renegotiate',

  INPUT_MOUSE_MOVE: 'input:mouse_move',
  INPUT_MOUSE_CLICK: 'input:mouse_click',
  INPUT_MOUSE_SCROLL: 'input:mouse_scroll',
  INPUT_KEY_PRESS: 'input:key_press',
  INPUT_KEY_RELEASE: 'input:key_release',

  CHAT_MESSAGE: 'chat:message',
  CHAT_TYPING: 'chat:typing',
  CHAT_READ: 'chat:read',

  FILE_TRANSFER_START: 'file:transfer_start',
  FILE_TRANSFER_PROGRESS: 'file:transfer_progress',
  FILE_TRANSFER_COMPLETE: 'file:transfer_complete',
  FILE_TRANSFER_ERROR: 'file:transfer_error',

  AGENT_RESTART: 'agent:restart',
  AGENT_UPDATE: 'agent:update',
  AGENT_STATUS: 'agent:status',

  NOTIFICATION_PUSH: 'notification:push',
  ERROR: 'error',
} as const;

// ─── Role-Based Permissions ───────────────────────────────────────

export const ROLE_PERMISSIONS: RolePermissions = {
  super_admin: [
    'sessions:view', 'sessions:create', 'sessions:end', 'sessions:control',
    'devices:view', 'devices:manage',
    'users:view', 'users:create', 'users:update', 'users:delete',
    'organizations:view', 'organizations:manage',
    'audit:view',
    'settings:view', 'settings:manage',
    'api_keys:view', 'api_keys:manage',
  ],
  org_admin: [
    'sessions:view', 'sessions:create', 'sessions:end', 'sessions:control',
    'devices:view', 'devices:manage',
    'users:view', 'users:create', 'users:update', 'users:delete',
    'organizations:view',
    'audit:view',
    'settings:view', 'settings:manage',
    'api_keys:view', 'api_keys:manage',
  ],
  technician: [
    'sessions:view', 'sessions:create', 'sessions:end', 'sessions:control',
    'devices:view',
    'users:view',
  ],
  user: [
    'sessions:view',
    'devices:view',
  ],
};

// ─── Session Constants ────────────────────────────────────────────

export const SESSION = {
  DEFAULT_TIMEOUT_MINUTES: 60,
  MAX_TIMEOUT_MINUTES: 480,
  APPROVAL_TIMEOUT_SECONDS: 120,
  HEARTBEAT_INTERVAL_MS: 15000,
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY_MS: 2000,
  MAX_FRAME_RATE: 30,
  DEFAULT_QUALITY: 75,
} as const;

// ─── API Constants ────────────────────────────────────────────────

export const API = {
  VERSION: 'v1',
  BASE_PATH: '/api/v1',
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

// ─── Error Codes ──────────────────────────────────────────────────

export const ERROR_CODES = {
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // Session
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_ALREADY_ACTIVE: 'SESSION_ALREADY_ACTIVE',
  SESSION_REJECTED: 'SESSION_REJECTED',
  SESSION_LIMIT_REACHED: 'SESSION_LIMIT_REACHED',

  // Device
  DEVICE_OFFLINE: 'DEVICE_OFFLINE',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  DEVICE_BUSY: 'DEVICE_BUSY',

  // Rate limit
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Server
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

// ─── Agent Constants ──────────────────────────────────────────────

export const AGENT = {
  CURRENT_VERSION: '1.0.0',
  UPDATE_CHECK_INTERVAL_MS: 3600000,
  RECONNECT_DELAY_MS: 5000,
  MAX_RECONNECT_ATTEMPTS: 10,
  HEARTBEAT_INTERVAL_MS: 10000,
  SCREEN_CAPTURE_INTERVAL_MS: 33,
  DEFAULT_PORT: 7373,
} as const;

// ─── HTTP Status Codes ────────────────────────────────────────────

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;
