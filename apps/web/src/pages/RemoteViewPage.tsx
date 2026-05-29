import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Monitor, Maximize2, Minimize2, PhoneOff, MousePointer,
  Eye, MessageSquare, Send, ChevronDown, Loader2, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { sessionApi } from '../services/api';
import { getSocket, WS_EVENTS } from '../services/socket';
import { useAuthStore } from '../store/auth.store';
import type { ChatMessage, MonitorInfo } from '@take-control/shared';
import { formatDuration } from '@take-control/shared';
import { clsx } from 'clsx';

export function RemoteViewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [controlMode, setControlMode] = useState<'view_only' | 'full_control' | 'none'>('none');
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [activeMonitor, setActiveMonitor] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string>('');

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionApi.get(sessionId!),
    enabled: !!sessionId,
  });

  // Duration timer
  useEffect(() => {
    const interval = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket & WebRTC setup
  useEffect(() => {
    if (!sessionId || !session) return;
    const socket = getSocket();

    socket.emit(WS_EVENTS.SESSION_START, { sessionId });
    setChatMessages(session.chatMessages ?? []);
    setSessionStatus(session.status);

    // WebRTC setup
    const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    const pc = new RTCPeerConnection({ iceServers });
    peerRef.current = pc;

    // Queue candidates that arrive before the remote description is set
    const pendingCandidates: RTCIceCandidateInit[] = [];
    const applyCandidate = (c: RTCIceCandidateInit) => {
      pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    };

    let animFrameId = 0;
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.autoplay = true;
      video.play().catch(() => {});
      video.onloadedmetadata = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        const draw = () => {
          ctx?.drawImage(video, 0, 0);
          animFrameId = requestAnimationFrame(draw);
        };
        draw();
        setIsConnected(true);
      };
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit(WS_EVENTS.RTC_ICE_CANDIDATE, {
          sessionId,
          toPeerId: session.device?.userId,
          candidate: e.candidate,
        });
      }
    };

    // Create offer
    pc.createOffer({ offerToReceiveVideo: true })
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        socket.emit(WS_EVENTS.RTC_OFFER, {
          sessionId,
          toPeerId: session.device?.userId,
          signal: pc.localDescription,
        });
      });

    socket.on(WS_EVENTS.RTC_ANSWER, async (data: any) => {
      // Guard: wrong session or null/malformed signal
      if (data.sessionId !== sessionId || !data.signal?.type) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
      // Drain any candidates that arrived before the answer
      pendingCandidates.splice(0).forEach(applyCandidate);
    });

    socket.on(WS_EVENTS.RTC_ICE_CANDIDATE, (data: any) => {
      if (data.sessionId !== sessionId) return;
      const c = data.candidate;
      // Skip end-of-candidates signals (sdpMid and sdpMLineIndex both null)
      if (!c || (c.sdpMid == null && c.sdpMLineIndex == null)) return;
      if (!pc.remoteDescription) { pendingCandidates.push(c); return; }
      applyCandidate(c);
    });

    socket.on(WS_EVENTS.CHAT_MESSAGE, (msg: ChatMessage) => {
      if (msg.sessionId === sessionId) {
        setChatMessages(prev => [...prev, msg]);
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    });

    socket.on(WS_EVENTS.SESSION_ENDED, (data: any) => {
      if (data.sessionId === sessionId) {
        toast('Session ended', { icon: '📴' });
        navigate('/dashboard');
      }
    });

    socket.on(WS_EVENTS.SESSION_CONTROL_TRANSFER, (data: any) => {
      if (data.sessionId === sessionId) {
        setControlMode(data.mode);
        toast(data.mode === 'full_control' ? 'Full control granted' : 'Control mode changed');
      }
    });

    socket.on(WS_EVENTS.DEVICE_INFO_UPDATE, (data: any) => {
      if (data.deviceId === session.deviceId) {
        setMonitors(data.monitors ?? []);
      }
    });

    return () => {
      pc.close();
      cancelAnimationFrame(animFrameId);
      socket.off(WS_EVENTS.RTC_ANSWER);
      socket.off(WS_EVENTS.RTC_ICE_CANDIDATE);
      socket.off(WS_EVENTS.CHAT_MESSAGE);
      socket.off(WS_EVENTS.SESSION_ENDED);
      socket.off(WS_EVENTS.SESSION_CONTROL_TRANSFER);
    };
  }, [sessionId, session]);

  // Mouse/keyboard input forwarding
  const sendMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (controlMode !== 'full_control') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    getSocket().emit(WS_EVENTS.INPUT_MOUSE_MOVE, { sessionId, x, y, monitorId: activeMonitor });
  }, [controlMode, sessionId, activeMonitor]);

  const sendMouseClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (controlMode !== 'full_control') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
    getSocket().emit(WS_EVENTS.INPUT_MOUSE_CLICK, { sessionId, x, y, button, type: 'click', monitorId: activeMonitor });
  }, [controlMode, sessionId, activeMonitor]);

  const handleEndSession = async () => {
    try {
      await sessionApi.end(sessionId!);
      navigate('/dashboard');
    } catch {
      toast.error('Failed to end session');
    }
  };

  const handleControlToggle = async () => {
    if (session?.status !== 'active') {
      toast.error('Session must be active to change control mode');
      return;
    }
    const newMode = controlMode === 'full_control' ? 'view_only' : 'full_control';
    try {
      await sessionApi.transferControl(sessionId!, newMode);
      setControlMode(newMode);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message ?? 'Failed to change control mode';
      toast.error(msg);
    }
  };

  const sendChatMessage = () => {
    if (!chatInput.trim()) return;
    getSocket().emit(WS_EVENTS.CHAT_MESSAGE, { sessionId, content: chatInput });
    setChatInput('');
  };

  if (isLoading) {
    return (
      <div className="h-screen bg-dark-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="h-screen bg-dark-950 flex items-center justify-center text-slate-400">
        <AlertCircle className="w-6 h-6 mr-2" />
        Session not found
      </div>
    );
  }

  return (
    <div className="h-screen bg-dark-950 flex flex-col">
      {/* Top bar */}
      <div className="h-12 bg-dark-900 border-b border-dark-700 flex items-center gap-3 px-4 flex-shrink-0">
        <Monitor className="w-4 h-4 text-primary-400" />
        <span className="text-sm font-medium text-white">{session.device?.name}</span>
        <span className="text-slate-600">·</span>
        <span className="text-xs text-slate-400">{session.device?.os} · {session.device?.ipAddress}</span>
        <span className="text-slate-600">·</span>
        <span className="text-xs text-slate-400 font-mono">{formatDuration(duration)}</span>

        <div className="flex-1" />

        {/* Monitor selector */}
        {monitors.length > 1 && (
          <div className="flex items-center gap-1">
            {monitors.map(m => (
              <button
                key={m.id}
                onClick={() => {
                  setActiveMonitor(m.id);
                  sessionApi.switchMonitor(sessionId!, m.id);
                }}
                className={clsx(
                  'px-2 py-1 text-xs rounded transition-colors',
                  m.id === activeMonitor
                    ? 'bg-primary-600 text-white'
                    : 'bg-dark-700 text-slate-400 hover:bg-dark-600'
                )}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}

        {/* Control toggle */}
        <button
          onClick={handleControlToggle}
          className={clsx(
            'btn text-xs gap-1.5',
            controlMode === 'full_control' ? 'btn-danger' : 'btn-secondary'
          )}
        >
          {controlMode === 'full_control' ? (
            <><MousePointer className="w-3.5 h-3.5" /> Release Control</>
          ) : (
            <><Eye className="w-3.5 h-3.5" /> Request Control</>
          )}
        </button>

        {/* Chat */}
        <button
          onClick={() => setChatOpen(p => !p)}
          className={clsx('btn btn-secondary text-xs relative', chatOpen && 'bg-dark-600')}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
          {chatMessages.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-600 rounded-full text-white text-xs flex items-center justify-center">
              {chatMessages.length > 9 ? '9+' : chatMessages.length}
            </span>
          )}
        </button>

        {/* Fullscreen */}
        <button
          onClick={() => setIsFullscreen(p => !p)}
          className="btn btn-secondary text-xs"
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>

        {/* End session */}
        <button onClick={handleEndSession} className="btn-danger text-xs">
          <PhoneOff className="w-3.5 h-3.5" />
          End Session
        </button>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center bg-black relative">
          {!isConnected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-dark-950">
              <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-3" />
              <p className="text-sm">Establishing connection...</p>
              <p className="text-xs text-slate-600 mt-1">Waiting for device approval</p>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className={clsx(
              'max-w-full max-h-full object-contain',
              controlMode === 'full_control' ? 'cursor-none' : 'cursor-default'
            )}
            onMouseMove={sendMouseMove}
            onClick={sendMouseClick}
            onContextMenu={e => e.preventDefault()}
          />
        </div>

        {/* Chat panel */}
        {chatOpen && (
          <div className="w-72 bg-dark-900 border-l border-dark-700 flex flex-col">
            <div className="p-3 border-b border-dark-700 text-sm font-medium text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary-400" />
              Chat
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {chatMessages.map(msg => (
                <div
                  key={msg.id}
                  className={clsx(
                    'flex flex-col',
                    msg.senderId === user?.id ? 'items-end' : 'items-start'
                  )}
                >
                  <span className="text-xs text-slate-500 mb-0.5">
                    {msg.sender?.displayName}
                  </span>
                  <div className={clsx(
                    'px-3 py-2 rounded-xl text-sm max-w-full break-words',
                    msg.senderId === user?.id
                      ? 'bg-primary-600 text-white'
                      : 'bg-dark-700 text-slate-200'
                  )}>
                    {msg.content}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="p-3 border-t border-dark-700 flex gap-2">
              <input
                className="input flex-1 text-sm"
                placeholder="Type a message..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
              />
              <button onClick={sendChatMessage} className="btn-primary px-3">
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Session approval overlay */}
      {session.status === 'waiting_approval' && (
        <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="card max-w-sm w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 text-orange-400" />
            </div>
            <h3 className="font-semibold text-white">Waiting for User Approval</h3>
            <p className="text-sm text-slate-400">
              {session.user?.displayName} needs to approve this session before you can connect.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary-400" />
              <span className="text-sm text-slate-400">Waiting...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
