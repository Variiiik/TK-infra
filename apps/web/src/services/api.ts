import axios from 'axios';
import { useAuthStore } from '../store/auth.store';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Attach auth token to requests
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const { refreshToken, updateAccessToken } = useAuthStore.getState();
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${BASE_URL}/api/v1/auth/refresh`, { refreshToken });
        updateAccessToken(data.data.accessToken);
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth API ─────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then(r => r.data.data),

  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refreshToken }),

  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }).then(r => r.data.data),

  me: () =>
    api.get('/auth/me').then(r => r.data.data),

  requestPasswordReset: (email: string) =>
    api.post('/auth/password/request-reset', { email }),

  resetPassword: (token: string, password: string) =>
    api.post('/auth/password/reset', { token, password }),
};

// ─── Session API ──────────────────────────────────────────────────

export const sessionApi = {
  getStats: () =>
    api.get('/sessions/stats').then(r => r.data.data),

  list: (params?: Record<string, unknown>) =>
    api.get('/sessions', { params }).then(r => r.data),

  get: (id: string) =>
    api.get(`/sessions/${id}`).then(r => r.data.data),

  getPendingRequests: () =>
    api.get('/sessions/requests/pending').then(r => r.data.data),

  createRequest: (data: { deviceId: string; description?: string; priority?: string }) =>
    api.post('/sessions/requests', data).then(r => r.data.data),

  acceptRequest: (requestId: string) =>
    api.post(`/sessions/requests/${requestId}/accept`).then(r => r.data.data),

  approve: (sessionId: string) =>
    api.post(`/sessions/${sessionId}/approve`),

  reject: (sessionId: string, reason?: string) =>
    api.post(`/sessions/${sessionId}/reject`, { reason }),

  end: (sessionId: string, reason?: string) =>
    api.post(`/sessions/${sessionId}/end`, { reason }),

  transferControl: (sessionId: string, mode: string) =>
    api.post(`/sessions/${sessionId}/control`, { mode }),

  switchMonitor: (sessionId: string, monitorId: number) =>
    api.post(`/sessions/${sessionId}/monitor`, { monitorId }),
};

// ─── User API ─────────────────────────────────────────────────────

export const userApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/users', { params }).then(r => r.data),

  get: (id: string) =>
    api.get(`/users/${id}`).then(r => r.data.data),

  create: (data: object) =>
    api.post('/users', data).then(r => r.data.data),

  update: (id: string, data: object) =>
    api.patch(`/users/${id}`, data).then(r => r.data.data),

  delete: (id: string) =>
    api.delete(`/users/${id}`),
};

// ─── Device API ───────────────────────────────────────────────────

export const deviceApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/devices', { params }).then(r => r.data),

  get: (id: string) =>
    api.get(`/devices/${id}`).then(r => r.data.data),

  update: (id: string, data: object) =>
    api.patch(`/devices/${id}`, data).then(r => r.data.data),

  delete: (id: string) =>
    api.delete(`/devices/${id}`),

  getOnline: () =>
    api.get('/devices/status/online').then(r => r.data.data),
};

// ─── Audit API ────────────────────────────────────────────────────

export const auditApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/audit', { params }).then(r => r.data),
};
