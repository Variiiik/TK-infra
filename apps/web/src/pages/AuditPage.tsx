import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Search } from 'lucide-react';
import { auditApi } from '../services/api';
import { formatRelativeTime } from '@take-control/shared';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  user_login:              { label: 'User Login',        color: 'text-emerald-400' },
  user_logout:             { label: 'User Logout',       color: 'text-slate-400' },
  user_created:            { label: 'User Created',      color: 'text-blue-400' },
  user_updated:            { label: 'User Updated',      color: 'text-cyan-400' },
  user_deleted:            { label: 'User Deleted',      color: 'text-red-400' },
  session_started:         { label: 'Session Started',   color: 'text-emerald-400' },
  session_ended:           { label: 'Session Ended',     color: 'text-slate-400' },
  session_control_granted: { label: 'Control Granted',   color: 'text-orange-400' },
  session_control_revoked: { label: 'Control Revoked',   color: 'text-slate-400' },
  device_registered:       { label: 'Device Registered', color: 'text-blue-400' },
  device_deleted:          { label: 'Device Deleted',    color: 'text-red-400' },
};

export function AuditPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['audit', page],
    queryFn: () => auditApi.list({ page, limit: 50 }),
  });

  const logs = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary-400" />
          Audit Log
        </h1>
        <p className="text-slate-400 text-sm mt-1">All security and activity events</p>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="divide-y divide-dark-800">
          {isLoading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="p-4 flex gap-4">
                <div className="w-24 h-4 bg-dark-700 rounded animate-pulse" />
                <div className="w-32 h-4 bg-dark-700 rounded animate-pulse" />
                <div className="flex-1 h-4 bg-dark-700 rounded animate-pulse" />
              </div>
            ))
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-slate-500">No audit events</div>
          ) : (
            logs.map((log: any) => {
              const action = ACTION_LABELS[log.action];
              return (
                <div key={log.id} className="p-4 flex items-start gap-4 hover:bg-dark-800/50 transition-colors">
                  <div className="w-48 flex-shrink-0">
                    <span className={`text-xs font-medium ${action?.color ?? 'text-slate-400'}`}>
                      {action?.label ?? log.action}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-slate-300">
                      <span className="font-medium text-white">{log.actor?.displayName}</span>
                      {' '}
                      <span className="text-slate-500">({log.actor?.email})</span>
                    </span>
                    {log.ipAddress && (
                      <span className="ml-2 text-xs text-slate-600 font-mono">{log.ipAddress}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 flex-shrink-0">
                    {formatRelativeTime(new Date(log.createdAt))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-dark-700">
            <p className="text-xs text-slate-500">{meta.total} total events</p>
            <div className="flex gap-2">
              <button className="btn btn-secondary text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </button>
              <span className="text-xs text-slate-400 flex items-center px-2">{page} / {meta.totalPages}</span>
              <button className="btn btn-secondary text-xs" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
