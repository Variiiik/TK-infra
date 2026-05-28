import { useQuery } from '@tanstack/react-query';
import { Monitor, Laptop, Users, Clock, Activity, TrendingUp } from 'lucide-react';
import { sessionApi } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { PendingRequestsPanel } from '../components/session/PendingRequestsPanel';
import { formatDuration } from '@take-control/shared';

function StatCard({ icon: Icon, label, value, color, delta }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  delta?: string;
}) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-400">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {delta && <p className="text-xs text-emerald-400 mt-1">{delta}</p>}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const user = useAuthStore(s => s.user);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: sessionApi.getStats,
    refetchInterval: 30000,
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Good {getTimeOfDay()}, {user?.firstName}
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-dark-700" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard
            icon={Activity}
            label="Active Sessions"
            value={stats?.activeSessions ?? 0}
            color="bg-blue-500/20 text-blue-400"
          />
          <StatCard
            icon={Clock}
            label="Pending Requests"
            value={stats?.pendingRequests ?? 0}
            color="bg-orange-500/20 text-orange-400"
          />
          <StatCard
            icon={Laptop}
            label="Online Devices"
            value={stats?.onlineDevices ?? 0}
            color="bg-emerald-500/20 text-emerald-400"
          />
          <StatCard
            icon={Users}
            label="Technicians"
            value={stats?.totalTechnicians ?? 0}
            color="bg-purple-500/20 text-purple-400"
          />
          <StatCard
            icon={Monitor}
            label="Sessions Today"
            value={stats?.sessionsToday ?? 0}
            color="bg-cyan-500/20 text-cyan-400"
          />
          <StatCard
            icon={TrendingUp}
            label="Avg Duration"
            value={formatDuration(stats?.avgSessionDuration ?? 0)}
            color="bg-pink-500/20 text-pink-400"
          />
        </div>
      )}

      {/* Pending requests */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <PendingRequestsPanel />
        </div>
        <div className="card">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary-400" />
            Quick Actions
          </h3>
          <div className="space-y-2">
            <a href="/sessions" className="flex items-center gap-3 p-3 rounded-lg hover:bg-dark-700 transition-colors text-sm text-slate-300">
              <Monitor className="w-4 h-4 text-blue-400" />
              View all sessions
            </a>
            <a href="/devices" className="flex items-center gap-3 p-3 rounded-lg hover:bg-dark-700 transition-colors text-sm text-slate-300">
              <Laptop className="w-4 h-4 text-emerald-400" />
              Manage devices
            </a>
            {(user?.role === 'super_admin' || user?.role === 'org_admin') && (
              <a href="/users" className="flex items-center gap-3 p-3 rounded-lg hover:bg-dark-700 transition-colors text-sm text-slate-300">
                <Users className="w-4 h-4 text-purple-400" />
                Manage users
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
