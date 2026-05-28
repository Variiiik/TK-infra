import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';
import { WS_EVENTS } from '@take-control/shared';

const WS_URL = import.meta.env.VITE_WS_URL ?? '';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = useAuthStore.getState().accessToken;
    socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => console.log('[WS] Connected', socket?.id));
    socket.on('disconnect', (reason) => console.log('[WS] Disconnected', reason));
    socket.on('connect_error', (err) => console.error('[WS] Connection error', err.message));
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function updateSocketToken(token: string): void {
  if (socket) {
    socket.auth = { token };
    socket.disconnect().connect();
  }
}

export { WS_EVENTS };
