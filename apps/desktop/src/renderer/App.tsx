import { useState, useEffect } from 'react';
import { Shield, Wifi, CheckCircle, XCircle, RefreshCw, Bell, AlertTriangle } from 'lucide-react';

declare global {
  interface Window {
    tcAgent?: {
      getStatus: () => Promise<string>;
      getDeviceInfo: () => Promise<any>;
      getActiveSession: () => Promise<any>;
      getVersion: () => Promise<string>;
      approveSession: (id: string) => Promise<void>;
      rejectSession: (id: string, r?: string) => Promise<void>;
      endSession: (id: string) => Promise<void>;
      revokeControl: () => Promise<void>;
      restartAgent: () => Promise<void>;
      installUpdate: () => Promise<void>;
      getScreenSources: () => Promise<Array<{ id: string; name: string }>>;
      sendRtcAnswer:       (d: unknown) => void;
      sendRtcOffer:        (d: unknown) => void;
      sendRtcIceCandidate: (d: unknown) => void;
      onStatusChange:      (cb: (s: string) => void)         => () => void;
      onSessionRequest:    (cb: (d: any) => void)            => () => void;
      onSessionStarted:    (cb: (d: any) => void)            => () => void;
      onSessionEnded:      (cb: (d: any) => void)            => () => void;
      onControlChanged:    (cb: (d: { mode: string }) => void) => () => void;
      onRtcSessionStart:   (cb: (d: any) => void)            => () => void;
      onRtcOffer:          (cb: (d: any) => void)            => () => void;
      onRtcAnswer:         (cb: (d: any) => void)            => () => void;
      onRtcIceCandidate:   (cb: (d: any) => void)            => () => void;
      onUpdateDownloaded:  (cb: (d: any) => void)            => () => void;
    };
    tcAgentError?: string;
  }
}

export default function App() {
  const [status, setStatus] = useState('connecting');
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [version, setVersion] = useState('');
  const [sessionRequest, setSessionRequest] = useState<any>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [controlMode, setControlMode] = useState('none');
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [bridgeError, setBridgeError] = useState(false);

  useEffect(() => {
    // Re-read window.tcAgent here — it's available after mount in Electron
    const bridge = window.tcAgent;

    if (!bridge) {
      const preloadErr = (window as any).tcAgentError;
      console.error('[TakeControl] window.tcAgent undefined — preload failed:', preloadErr ?? 'unknown');
      setBridgeError(true);
      return;
    }

    // Load initial state
    Promise.all([
      bridge.getStatus(),
      bridge.getDeviceInfo(),
      bridge.getVersion(),
      bridge.getActiveSession(),
    ]).then(([s, info, ver, sess]) => {
      setStatus(s ?? 'stopped');
      setDeviceInfo(info);
      setVersion(ver ?? '');
      setActiveSession(sess);
    }).catch(err => {
      console.error('[TakeControl] IPC init failed:', err);
    });

    // Subscribe to events
    const unsubs = [
      bridge.onStatusChange(setStatus),
      bridge.onSessionRequest(setSessionRequest),
      bridge.onSessionStarted(setActiveSession),
      bridge.onSessionEnded(() => { setActiveSession(null); setControlMode('none'); }),
      bridge.onControlChanged((d: any) => setControlMode(d.mode)),
      bridge.onUpdateDownloaded(() => setUpdateDownloaded(true)),
    ];

    return () => unsubs.forEach(u => u?.());
  }, []);

  // ─── WebRTC: runs in renderer (browser context has RTCPeerConnection) ─────
  useEffect(() => {
    const bridge = window.tcAgent;
    if (!bridge) return;

    let pc: RTCPeerConnection | null = null;

    const cleanup = () => { pc?.close(); pc = null; };

    const initPeerConnection = (sessionData: any) => {
      cleanup();
      pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          console.log('[RTC] sending ice candidate to', sessionData.fromPeerId ?? sessionData.technicianId);
          bridge.sendRtcIceCandidate({
            sessionId: sessionData.sessionId,
            toPeerId:  sessionData.fromPeerId ?? sessionData.technicianId,
            // Serialize to plain object to survive Electron IPC structured clone
            candidate: e.candidate.toJSON(),
          });
        }
      };
      pc.oniceconnectionstatechange = () => console.log('[RTC] ICE state:', pc?.iceConnectionState);
      return pc;
    };

    const captureScreen = async (): Promise<void> => {
      const sources = await bridge.getScreenSources();
      const source = sources[0];
      if (!source || !pc) return;
      const stream: MediaStream = await (navigator.mediaDevices as any).getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource:   'desktop',
            chromeMediaSourceId: source.id,
            maxWidth:  1920,
            maxHeight: 1080,
            maxFrameRate: 30,
          },
        },
      });
      stream.getTracks().forEach(t => pc?.addTrack(t, stream));
    };

    const unRtcStart = bridge.onRtcSessionStart((data: any) => {
      console.log('[RTC] session-start received, pc exists:', !!pc);
      if (!pc) initPeerConnection(data);
    });

    const unOffer = bridge.onRtcOffer(async (data: any) => {
      console.log('[RTC] offer received, pc exists:', !!pc, 'sessionId:', data.sessionId);
      if (!pc) initPeerConnection(data);
      try {
        await pc!.setRemoteDescription(new RTCSessionDescription(data.signal));
        console.log('[RTC] remote description set, capturing screen...');
        if (pc!.getSenders().length === 0) await captureScreen();
        console.log('[RTC] senders after capture:', pc!.getSenders().length);
        const answer = await pc!.createAnswer();
        await pc!.setLocalDescription(answer);
        // Log video direction from SDP to confirm track is included
        const videoLine = answer.sdp?.match(/m=video.*\r?\n(.*\r?\n)*?a=(sendonly|recvonly|sendrecv|inactive)/);
        console.log('[RTC] answer video direction:', videoLine?.[2] ?? 'NOT FOUND in SDP');
        console.log('[RTC] answer created, sending...');
        // Serialize to plain object — RTCSessionDescription getters are lost in IPC structured clone
        bridge.sendRtcAnswer({
          sessionId: data.sessionId,
          toPeerId:  data.fromPeerId,
          signal:    { type: answer.type, sdp: answer.sdp },
        });
        console.log('[RTC] answer sent to', data.fromPeerId);
      } catch (err) { console.error('[RTC] answer failed:', err); }
    });

    const unIce = bridge.onRtcIceCandidate((data: any) => {
      const c = data.candidate;
      if (!c || (c.sdpMid == null && c.sdpMLineIndex == null)) return;
      console.log('[RTC] applying ice candidate, has remote desc:', !!pc?.remoteDescription);
      pc?.addIceCandidate(new RTCIceCandidate(c)).catch(e => console.error('[RTC] addIceCandidate failed:', e));
    });

    const unEnd = bridge.onSessionEnded(() => cleanup());

    return () => {
      cleanup();
      unRtcStart?.();
      unOffer?.();
      unIce?.();
      unEnd?.();
    };
  }, []);

  // ─── Bridge error screen ──────────────────────────────────────────

  if (bridgeError) {
    return (
      <div className="h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-red-600/20 flex items-center justify-center">
          <XCircle className="w-6 h-6 text-red-400" />
        </div>
        <div>
          <p className="text-white font-semibold">IPC Bridge Error</p>
          <p className="text-slate-400 text-sm mt-1">
            Preload script failed to initialize.
          </p>
          <p className="text-slate-600 text-xs mt-2 font-mono">
            window.tcAgent is undefined
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded-lg transition-colors"
        >
          Reload
        </button>
      </div>
    );
  }

  // ─── Status config ────────────────────────────────────────────────

  const statusConfig = ({
    running:    { color: 'text-emerald-400', bg: 'bg-emerald-500', label: 'Connected' },
    connecting: { color: 'text-amber-400',   bg: 'bg-amber-500',   label: 'Connecting...' },
    stopped:    { color: 'text-slate-400',   bg: 'bg-slate-500',   label: 'Stopped' },
    error:      { color: 'text-red-400',     bg: 'bg-red-500',     label: 'Error' },
  } as Record<string, any>)[status] ?? { color: 'text-slate-400', bg: 'bg-slate-500', label: status };

  return (
    <div className="h-screen bg-gray-950 text-slate-100 flex flex-col select-none overflow-hidden">
      {/* Header */}
      <div className="h-14 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <span className="font-semibold text-sm text-white">TakeControl Agent</span>
          {version && <span className="text-xs text-gray-500 ml-2">v{version}</span>}
        </div>
        <div className={`flex items-center gap-1.5 ${statusConfig.color}`}>
          <div className={`w-2 h-2 rounded-full ${statusConfig.bg} animate-pulse`} />
          <span className="text-xs font-medium">{statusConfig.label}</span>
        </div>
      </div>

      {/* Update banner */}
      {updateDownloaded && (
        <div className="mx-3 mt-3 p-3 bg-indigo-600/20 border border-indigo-600/40 rounded-xl flex items-center gap-3">
          <Bell className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium text-indigo-300">Update ready to install</p>
          </div>
          <button
            onClick={() => window.tcAgent?.installUpdate()}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            Restart
          </button>
        </div>
      )}

      {/* Session request */}
      {sessionRequest && !activeSession && (
        <div className="mx-3 mt-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Support Request</p>
              <p className="text-xs text-slate-400 mt-1">
                <span className="text-white font-medium">{sessionRequest.technician?.displayName}</span>
                {' '}wants to connect to your computer.
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                They will be able to view and control your screen.
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
              onClick={() => {
                window.tcAgent?.approveSession(sessionRequest.sessionId);
                setActiveSession(sessionRequest);
                setSessionRequest(null);
              }}
            >
              <CheckCircle className="w-4 h-4" />
              Allow
            </button>
            <button
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-medium rounded-lg border border-red-600/30 transition-colors"
              onClick={() => {
                window.tcAgent?.rejectSession(sessionRequest.sessionId);
                setSessionRequest(null);
              }}
            >
              <XCircle className="w-4 h-4" />
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Active session */}
      {activeSession && (
        <div className="mx-3 mt-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm font-semibold text-white">Session Active</span>
          </div>
          <div className="space-y-1 text-xs text-slate-400 mb-3">
            <div className="flex justify-between">
              <span>Technician</span>
              <span className="text-white">{activeSession.technician?.displayName ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Control Mode</span>
              <span className={controlMode === 'full_control' ? 'text-orange-400' : 'text-slate-300'}>
                {controlMode === 'full_control' ? '⚠ Full Control' : controlMode.replace('_', ' ')}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {controlMode === 'full_control' && (
              <button
                className="flex-1 py-2 text-xs bg-amber-600/20 text-amber-400 border border-amber-600/30 rounded-lg hover:bg-amber-600/30 transition-colors"
                onClick={() => window.tcAgent?.revokeControl()}
              >
                Revoke Control
              </button>
            )}
            <button
              className="flex-1 py-2 text-xs bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors"
              onClick={() => window.tcAgent?.endSession(activeSession.sessionId)}
            >
              End Session
            </button>
          </div>
        </div>
      )}

      {/* Device info */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {deviceInfo ? (
          <div className="p-3 bg-gray-900 rounded-xl border border-gray-800">
            <p className="text-xs font-medium text-slate-400 mb-2">Device Information</p>
            {([
              ['Hostname', deviceInfo.hostname],
              ['OS', deviceInfo.osVersion],
              ['User', deviceInfo.username],
              ['CPU', deviceInfo.cpuInfo],
              ['RAM', deviceInfo.ramInfo],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="flex justify-between py-1 text-xs border-b border-gray-800 last:border-0">
                <span className="text-slate-500">{label}</span>
                <span className="text-slate-300 font-mono text-right max-w-[200px] truncate">{value ?? '—'}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-slate-600 gap-2">
            <Wifi className="w-8 h-8" />
            <p className="text-sm">Connecting to server...</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="h-10 bg-gray-900 border-t border-gray-800 flex items-center justify-between px-4">
        <span className="text-xs text-gray-600">TakeControl Agent</span>
        <button
          onClick={() => window.tcAgent?.restartAgent()}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Restart
        </button>
      </div>
    </div>
  );
}
