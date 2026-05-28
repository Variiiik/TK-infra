import { contextBridge, ipcRenderer } from 'electron';

try {
  contextBridge.exposeInMainWorld('tcAgent', {
    // ─── Agent info ─────────────────────────────────────────────────
    getStatus:        () => ipcRenderer.invoke('agent:get-status'),
    getDeviceInfo:    () => ipcRenderer.invoke('agent:get-device-info'),
    getActiveSession: () => ipcRenderer.invoke('agent:get-active-session'),
    getVersion:       () => ipcRenderer.invoke('app:get-version'),

    // ─── Session actions ────────────────────────────────────────────
    approveSession:   (id: string)              => ipcRenderer.invoke('session:approve', id),
    rejectSession:    (id: string, r?: string)  => ipcRenderer.invoke('session:reject', id, r),
    endSession:       (id: string)              => ipcRenderer.invoke('session:end', id),
    revokeControl:    ()                        => ipcRenderer.invoke('control:revoke'),
    restartAgent:     ()                        => ipcRenderer.invoke('agent:restart'),
    installUpdate:    ()                        => ipcRenderer.invoke('update:install'),

    // ─── Screen sources (for WebRTC getUserMedia) ────────────────────
    getScreenSources: () => ipcRenderer.invoke('screen:get-sources'),

    // ─── WebRTC: renderer → main → server ───────────────────────────
    sendRtcAnswer:       (data: unknown) => ipcRenderer.send('rtc:send-answer', data),
    sendRtcOffer:        (data: unknown) => ipcRenderer.send('rtc:send-offer',  data),
    sendRtcIceCandidate: (data: unknown) => ipcRenderer.send('rtc:send-ice',    data),

    // ─── Event listeners ────────────────────────────────────────────
    onStatusChange: (cb: (s: string) => void) => {
      const h = (_: unknown, s: string) => cb(s);
      ipcRenderer.on('agent:status-change', h);
      return () => ipcRenderer.removeListener('agent:status-change', h);
    },
    onSessionRequest: (cb: (d: unknown) => void) => {
      const h = (_: unknown, d: unknown) => cb(d);
      ipcRenderer.on('session:request', h);
      return () => ipcRenderer.removeListener('session:request', h);
    },
    onSessionStarted: (cb: (d: unknown) => void) => {
      const h = (_: unknown, d: unknown) => cb(d);
      ipcRenderer.on('session:started', h);
      return () => ipcRenderer.removeListener('session:started', h);
    },
    onSessionEnded: (cb: (d: unknown) => void) => {
      const h = (_: unknown, d: unknown) => cb(d);
      ipcRenderer.on('session:ended', h);
      return () => ipcRenderer.removeListener('session:ended', h);
    },
    onControlChanged: (cb: (d: { mode: string }) => void) => {
      const h = (_: unknown, d: { mode: string }) => cb(d);
      ipcRenderer.on('control:changed', h);
      return () => ipcRenderer.removeListener('control:changed', h);
    },
    // WebRTC signals from server → renderer
    onRtcSessionStart: (cb: (d: unknown) => void) => {
      const h = (_: unknown, d: unknown) => cb(d);
      ipcRenderer.on('rtc:session-start', h);
      return () => ipcRenderer.removeListener('rtc:session-start', h);
    },
    onRtcOffer: (cb: (d: unknown) => void) => {
      const h = (_: unknown, d: unknown) => cb(d);
      ipcRenderer.on('rtc:offer', h);
      return () => ipcRenderer.removeListener('rtc:offer', h);
    },
    onRtcAnswer: (cb: (d: unknown) => void) => {
      const h = (_: unknown, d: unknown) => cb(d);
      ipcRenderer.on('rtc:answer', h);
      return () => ipcRenderer.removeListener('rtc:answer', h);
    },
    onRtcIceCandidate: (cb: (d: unknown) => void) => {
      const h = (_: unknown, d: unknown) => cb(d);
      ipcRenderer.on('rtc:ice-candidate', h);
      return () => ipcRenderer.removeListener('rtc:ice-candidate', h);
    },
    onUpdateDownloaded: (cb: (d: unknown) => void) => {
      const h = (_: unknown, d: unknown) => cb(d);
      ipcRenderer.on('update:downloaded', h);
      return () => ipcRenderer.removeListener('update:downloaded', h);
    },
  });
} catch (err) {
  console.error('[Preload] contextBridge setup failed:', err);
  try { contextBridge.exposeInMainWorld('tcAgentError', String(err)); } catch {}
}
