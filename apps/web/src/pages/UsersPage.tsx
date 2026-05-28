import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Search, Shield, Wrench, UserIcon, Trash2, Edit } from 'lucide-react';
import toast from 'react-hot-toast';
import { userApi } from '../services/api';
import { formatRelativeTime } from '@take-control/shared';
import { clsx } from 'clsx';

const ROLE_STYLES: Record<string, { label: string; cls: string }> = {
  super_admin: { label: 'Super Admin', cls: 'bg-red-500/20 text-red-400' },
  org_admin:   { label: 'Org Admin',   cls: 'bg-orange-500/20 text-orange-400' },
  technician:  { label: 'Technician',  cls: 'bg-blue-500/20 text-blue-400' },
  user:        { label: 'User',        cls: 'bg-slate-500/20 text-slate-400' },
};

const STATUS_STYLES: Record<string, string> = {
  active: 'badge-online',
  inactive: 'badge-offline',
  suspended: 'bg-red-500/20 text-red-400',
};

export function UsersPage() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['users', search, role],
    queryFn: () => userApi.list({ search: search || undefined, role: role || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => userApi.delete(id),
    onSuccess: () => {
      toast.success('User deactivated');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const users = data?.data ?? [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-slate-400 text-sm mt-1">Manage organization members</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="input pl-9 w-64"
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {(['', 'super_admin', 'org_admin', 'technician', 'user'] as const).map(r => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={clsx('btn text-xs', role === r ? 'btn-primary' : 'btn-secondary')}
          >
            {r === '' ? 'All Roles' : ROLE_STYLES[r]?.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-700">
              <th className="text-left p-4 text-slate-400 font-medium">User</th>
              <th className="text-left p-4 text-slate-400 font-medium">Role</th>
              <th className="text-left p-4 text-slate-400 font-medium">Status</th>
              <th className="text-left p-4 text-slate-400 font-medium">Last Login</th>
              <th className="text-left p-4 text-slate-400 font-medium">Joined</th>
              <th className="p-4" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-dark-800">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="p-4">
                      <div className="h-4 bg-dark-700 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-slate-500">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((u: any) => (
                <tr key={u.id} className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-700 flex items-center justify-center text-xs font-semibold text-white">
                        {u.firstName?.[0]}{u.lastName?.[0]}
                      </div>
                      <div>
                        <p className="font-medium text-white">{u.displayName}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={clsx('badge text-xs', ROLE_STYLES[u.role]?.cls)}>
                      {ROLE_STYLES[u.role]?.label}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={clsx('badge text-xs', STATUS_STYLES[u.status])}>
                      {u.status}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-slate-500">
                    {u.lastLoginAt ? formatRelativeTime(new Date(u.lastLoginAt)) : 'Never'}
                  </td>
                  <td className="p-4 text-xs text-slate-500">
                    {formatRelativeTime(new Date(u.createdAt))}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button className="btn btn-secondary text-xs px-2.5">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="btn-danger text-xs px-2.5"
                        onClick={() => deleteMutation.mutate(u.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
