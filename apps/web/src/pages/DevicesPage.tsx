import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Laptop, Search, Wifi, WifiOff, Monitor, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { deviceApi, sessionApi } from '../services/api';
import { formatRelativeTime, getOSLabel } from '@take-control/shared';
import { clsx } from 'clsx';

const OS_ICON: Record<string, string> = {
  windows: '🪟',
  macos: '🍎',
  linux: '🐧',
  unknown: '💻',
};

export function DevicesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['devices', search, statusFilter],
    queryFn: () => deviceApi.list({ search: search || undefined, status: statusFilter || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deviceApi.delete(id),
    onSuccess: () => {
      toast.success('Device removed');
      qc.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: () => toast.error('Failed to remove device'),
  });

  // One-click connect: create request → accept → navigate to remote view
  const connectMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      // 1. Create support request
      const request = await sessionApi.createRequest({ deviceId });
      // 2. Technician immediately accepts it
      const session = await sessionApi.acceptRequest(request.id);
      return session;
    },
    onMutate: (deviceId) => setConnectingDeviceId(deviceId),
    onSuccess: (session) => {
      setConnectingDeviceId(null);
      toast.success('Connecting...');
      qc.invalidateQueries({ queryKey: ['devices'] });
      // Navigate to remote view
      navigate(`/remote/${session.id}`);
    },
    onError: (err: any) => {
      setConnectingDeviceId(null);
      const msg = err?.response?.data?.error?.message ?? 'Failed to connect';
      toast.error(msg);
    },
  });

  const devices = data?.data ?? [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Devices</h1>
        <p className="text-slate-400 text-sm mt-1">All registered devices and agents</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="input pl-9 w-64"
            placeholder="Search devices..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {(['', 'online', 'offline', 'busy'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={clsx('btn text-xs', statusFilter === s ? 'btn-primary' : 'btn-secondary')}
          >
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Device grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-36 animate-pulse bg-dark-700" />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">
          <Laptop className="w-10 h-10 mx-auto mb-3 text-slate-700" />
          <p>No devices found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {devices.map((device: any) => (
            <div key={device.id} className="card hover:border-dark-600 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{OS_ICON[device.os] ?? '💻'}</span>
                  <div>
                    <p className="font-medium text-white text-sm">{device.name}</p>
                    <p className="text-xs text-slate-500">{device.hostname}</p>
                  </div>
                </div>
                <span className={clsx(
                  'badge',
                  device.status === 'online' ? 'badge-online' :
                  device.status === 'busy' ? 'badge-busy' : 'badge-offline'
                )}>
                  {device.status === 'online' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {device.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>OS</span>
                  <span className="text-slate-300">{getOSLabel(device.os)} {device.osVersion}</span>
                </div>
                <div className="flex justify-between">
                  <span>IP</span>
                  <span className="text-slate-300 font-mono">{device.ipAddress ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>User</span>
                  <span className="text-slate-300">{device.user?.displayName ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last seen</span>
                  <span className="text-slate-300">
                    {device.lastSeenAt ? formatRelativeTime(new Date(device.lastSeenAt)) : '—'}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                {device.status === 'online' && (
                  <button
                    className="btn-primary flex-1 text-xs"
                    onClick={() => connectMutation.mutate(device.id)}
                    disabled={connectingDeviceId === device.id}
                  >
                    {connectingDeviceId === device.id
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting...</>
                      : <><Monitor className="w-3.5 h-3.5" /> Connect</>
                    }
                  </button>
                )}
                {device.status === 'busy' && (
                  <button
                    className="btn-secondary flex-1 text-xs"
                    onClick={() => navigate(`/sessions`)}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    View Session
                  </button>
                )}
                <button
                  className="btn-danger text-xs px-2.5"
                  onClick={() => deleteMutation.mutate(device.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
