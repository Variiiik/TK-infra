import { Outlet, Navigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';

export function AuthLayout() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-600 mb-4">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">TakeControl</h1>
          <p className="text-slate-400 text-sm mt-1">Enterprise Remote Assist Platform</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
