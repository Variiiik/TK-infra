import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Monitor, Clock, User, Search } from 'lucide-react';
import { sessionApi } from '../services/api';
import { formatDuration, formatRelativeTime, getOSLabel } from '@take-control/shared';
import { clsx } from 'clsx';

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-active',
  pending: 'badge-pending',
  waiting_approval: 'badge-pending',
  ended: 'badge-ended',
  rejected: 'badge-offline',
};

export function SessionsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['sessions', status, page],
    queryFn: () => sessionApi.list({ status: status || undefined, page, limit: 20 }),
    refetchInterval: 30000,
  });

  const sessions = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sessions</h1>
          <p className="text-slate-400 text-sm mt-1">All remote support sessions</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="input pl-9 w-64"
            placeholder="Search sessions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {(['', 'active', 'pending', 'ended'] as const).map(s => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(1); }}
            className={clsx(
              'btn text-xs',
              status === s ? 'btn-primary' : 'btn-secondary'
            )}
          >
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-700">
              <th className="text-left p-4 text-slate-400 font-medium">Device</th>
              <th className="text-left p-4 text-slate-400 font-medium">User</th>
              <th className="text-left p-4 text-slate-400 font-medium">Technician</th>
              <th className="text-left p-4 text-slate-400 font-medium">Status</th>
              <th className="text-left p-4 text-slate-400 font-medium">Duration</th>
              <th className="text-left p-4 text-slate-400 font-medium">Started</th>
              <th className="p-4" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-dark-800">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="p-4">
                      <div className="h-4 bg-dark-700 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-slate-500">
                  No sessions found
                </td>
              </tr>
            ) : (
              sessions.map((session: any) => (
                <tr
                  key={session.id}
                  className="border-b border-dark-800 hover:bg-dark-800/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/sessions/${session.id}`)}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-slate-500" />
                      <div>
                        <p className="font-medium text-white">{session.device?.name}</p>
                        <p className="text-xs text-slate-500">{getOSLabel(session.device?.os)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-slate-300">{session.user?.displayName}</td>
                  <td className="p-4 text-slate-300">{session.technician?.displayName}</td>
                  <td className="p-4">
                    <span className={STATUS_BADGE[session.status] ?? 'badge'}>
                      {session.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4 text-slate-400 font-mono text-xs">
                    {session.durationSeconds ? formatDuration(session.durationSeconds) : '—'}
                  </td>
                  <td className="p-4 text-slate-500 text-xs">
                    {session.startedAt ? formatRelativeTime(new Date(session.startedAt)) : '—'}
                  </td>
                  <td className="p-4">
                    {session.status === 'active' && (
                      <button
                        className="btn-primary text-xs"
                        onClick={e => { e.stopPropagation(); navigate(`/remote/${session.id}`); }}
                      >
                        Join
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-dark-700">
            <p className="text-xs text-slate-500">
              {meta.total} total sessions
            </p>
            <div className="flex gap-2">
              <button
                className="btn btn-secondary text-xs"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </button>
              <span className="btn btn-secondary text-xs">
                {page} / {meta.totalPages}
              </span>
              <button
                className="btn btn-secondary text-xs"
                disabled={page >= meta.totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
