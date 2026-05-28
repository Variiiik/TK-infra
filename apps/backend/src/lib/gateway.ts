// Gateway singleton — allows any module to emit WebSocket events
// Set by SocketGateway constructor after initialization

let emitFn: ((room: string, event: string, data: unknown) => void) | null = null;

export function setGatewayEmitter(fn: (room: string, event: string, data: unknown) => void) {
  emitFn = fn;
}

export function emitToRoom(room: string, event: string, data: unknown) {
  emitFn?.(room, event, data);
}

export function emitToDevice(deviceId: string, event: string, data: unknown) {
  emitFn?.(`device:${deviceId}`, event, data);
}

export function emitToUser(userId: string, event: string, data: unknown) {
  emitFn?.(`user:${userId}`, event, data);
}
