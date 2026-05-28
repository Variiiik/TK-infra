import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard, Monitor, Users, Laptop, Shield,
  Settings, LogOut, Bell, ChevronLeft, ChevronRight,
  Zap, Sun, Moon, Menu
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import { authApi } from '../../services/api';
import { disconnectSocket } from '../../services/socket';
import { getInitials } from '@take-control/shared';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/sessions', icon: Monitor, label: 'Sessions' },
  { to: '/devices', icon: Laptop, label: 'Devices' },
  { to: '/users', icon: Users, label: 'Users', roles: ['super_admin', 'org_admin'] },
  { to: '/audit', icon: Shield, label: 'Audit Log', roles: ['super_admin', 'org_admin'] },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function AppLayout() {
  const { user, logout, refreshToken } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar, theme, toggleTheme } = useUIStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } finally {
      disconnectSocket();
      logout();
      navigate('/login');
    }
  };

  const filteredNav = NAV_ITEMS.filter(item =>
    !item.roles || (user && item.roles.includes(user.role))
  );

  return (
    <div className="flex h-screen overflow-hidden bg-dark-950">
      {/* Sidebar */}
      <aside className={clsx(
        'flex flex-col bg-dark-900 border-r border-dark-700 transition-all duration-300 flex-shrink-0',
        sidebarCollapsed ? 'w-16' : 'w-60'
      )}>
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-dark-700">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
            {!sidebarCollapsed && (
              <span className="font-semibold text-white text-sm truncate">TakeControl</span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
          {filteredNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-600/20 text-primary-400'
                  : 'text-slate-400 hover:bg-dark-700 hover:text-slate-200'
              )}
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-dark-700 p-3 space-y-1">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 px-2 py-2 w-full rounded-lg text-sm text-slate-400 hover:bg-dark-700 hover:text-slate-200 transition-colors"
            title={sidebarCollapsed ? 'Toggle theme' : undefined}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 flex-shrink-0" /> : <Moon className="w-4 h-4 flex-shrink-0" />}
            {!sidebarCollapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>

          {!sidebarCollapsed && user && (
            <div className="flex items-center gap-2 px-2 py-2 rounded-lg">
              <div className="w-7 h-7 rounded-full bg-primary-700 flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
                {getInitials(user.displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-200 truncate">{user.displayName}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-2 py-2 w-full rounded-lg text-sm text-slate-400 hover:bg-red-600/10 hover:text-red-400 transition-colors"
            title={sidebarCollapsed ? 'Logout' : undefined}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!sidebarCollapsed && <span>Logout</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className="absolute right-0 translate-x-1/2 top-20 w-5 h-5 rounded-full bg-dark-700 border border-dark-600 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-dark-600 transition-colors z-10"
          style={{ position: 'relative', margin: '0 auto 8px', display: 'flex' }}
        >
          {sidebarCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
