import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Clock, Monitor, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { sessionApi } from '../../services/api';
import { formatRelativeTime, getOSLabel } from '@take-control/shared';
import type { SupportRequest } from '@take-control/shared';
import { clsx } from 'clsx';

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'text-red-400 bg-red-500/10',
  high: 'text-orange-400 bg-orange-500/10',
  normal: 'text-blue-400 bg-blue-500/10',
  low: 'text-slate-400 bg-slate-500/10',
};

export function PendingRequestsPanel() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['pending-requests'],
    queryFn: sessionApi.getPendingRequests,
    refetchInterval: 15000,
  });

  const acceptMutation = useMutation({
    mutationFn: (requestId: string) => sessionApi.acceptRequest(requestId),
    onSuccess: (session) => {
      toast.success('Request accepted — session created');
      qc.invalidateQueries({ queryKey: ['pending-requests'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      navigate(`/remote/${session.id}`);
    },
    onError: () => toast.error('Failed to accept request'),
  });

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-orange-400" />
          Pending Requests
          {requests.length > 0 && (
            <span className="badge badge-pending">{requests.length}</span>
          )}
        </h3>
        <a href="/sessions" className="text-xs text-primary-400 hover:text-primary-300">
          View all
        </a>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-lg bg-dark-700 animate-pulse" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-600" />
          <p className="text-sm">No pending requests</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(requests as SupportRequest[]).map(req => (
            <div
              key={req.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-dark-900 border border-dark-700 hover:border-dark-600 transition-colors"
            >
              <Monitor className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white truncate">
                    {req.device?.name ?? req.deviceId}
                  </span>
                  <span className={clsx('badge text-xs', PRIORITY_STYLES[req.priority])}>
                    {req.priority}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-500">
                    {getOSLabel(req.device?.os ?? '')} · {req.user?.displayName}
                  </span>
                  <span className="text-xs text-slate-600">·</span>
                  <span className="text-xs text-slate-500">
                    {formatRelativeTime(req.createdAt)}
                  </span>
                </div>
              </div>
              <button
                className="btn-success text-xs px-3 py-1.5"
                onClick={() => acceptMutation.mutate(req.id)}
                disabled={acceptMutation.isPending}
              >
                Accept
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
