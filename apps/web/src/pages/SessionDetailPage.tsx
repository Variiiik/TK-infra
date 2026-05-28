import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Monitor, ArrowLeft, Clock, User, Laptop, MessageSquare } from 'lucide-react';
import { sessionApi } from '../services/api';
import { formatDuration, formatRelativeTime, getOSLabel } from '@take-control/shared';
import { clsx } from 'clsx';

export function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionApi.get(sessionId!),
  });

  if (isLoading) {
    return <div className="p-6 text-slate-400">Loading...</div>;
  }

  if (!session) {
    return <div className="p-6 text-slate-400">Session not found</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Monitor className="w-6 h-6 text-primary-400" />
            Session Details
          </h1>
          <p className="text-slate-500 text-xs font-mono mt-1">{session.id}</p>
        </div>
        {session.status === 'active' && (
          <button
            className="btn-primary"
            onClick={() => navigate(`/remote/${session.id}`)}
          >
            Join Session
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h3 className="font-medium text-white flex items-center gap-2">
            <Laptop className="w-4 h-4 text-slate-400" />
            Device
          </h3>
          <InfoRow label="Name" value={session.device?.name} />
          <InfoRow label="Hostname" value={session.device?.hostname} />
          <InfoRow label="OS" value={`${getOSLabel(session.device?.os)} ${session.device?.osVersion}`} />
          <InfoRow label="IP Address" value={session.device?.ipAddress} mono />
        </div>

        <div className="card space-y-3">
          <h3 className="font-medium text-white flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400" />
            Participants
          </h3>
          <InfoRow label="User" value={session.user?.displayName} />
          <InfoRow label="User Email" value={session.user?.email} />
          <InfoRow label="Technician" value={session.technician?.displayName} />
          <InfoRow label="Technician Email" value={session.technician?.email} />
        </div>

        <div className="card space-y-3">
          <h3 className="font-medium text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            Timeline
          </h3>
          <InfoRow label="Status" value={session.status} badge />
          <InfoRow label="Started" value={session.startedAt ? formatRelativeTime(new Date(session.startedAt)) : '—'} />
          <InfoRow label="Ended" value={session.endedAt ? formatRelativeTime(new Date(session.endedAt)) : '—'} />
          <InfoRow label="Duration" value={session.durationSeconds ? formatDuration(session.durationSeconds) : '—'} />
          {session.endReason && <InfoRow label="End Reason" value={session.endReason.replace(/_/g, ' ')} />}
        </div>

        <div className="card space-y-3">
          <h3 className="font-medium text-white">Security</h3>
          <InfoRow label="Encryption" value={session.encryptionMethod} />
          <InfoRow label="Control Mode" value={session.controlMode} />
          <InfoRow label="Technician IP" value={session.technicianIp ?? '—'} mono />
          <InfoRow label="User IP" value={session.userIp ?? '—'} mono />
        </div>
      </div>

      {/* Chat messages */}
      {session.chatMessages && session.chatMessages.length > 0 && (
        <div className="card">
          <h3 className="font-medium text-white flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-slate-400" />
            Chat History ({session.chatMessages.length} messages)
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {session.chatMessages.map((msg: any) => (
              <div key={msg.id} className="flex gap-3 text-sm">
                <span className="text-slate-500 text-xs w-16 flex-shrink-0 pt-0.5 font-mono">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="font-medium text-primary-400">{msg.sender?.displayName}:</span>
                <span className="text-slate-300">{msg.content}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono, badge }: { label: string; value?: string; mono?: boolean; badge?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={clsx(
        mono ? 'font-mono text-xs' : '',
        badge ? 'badge badge-active' : 'text-slate-300'
      )}>
        {value ?? '—'}
      </span>
    </div>
  );
}
