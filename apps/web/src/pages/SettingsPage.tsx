import { useState, useEffect } from 'react';
import { Settings, Shield, Bell, Users, Key, Building } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth.store';
import { organizationApi } from '../services/api';

export function SettingsPage() {
  const user = useAuthStore(s => s.user);
  const [activeTab, setActiveTab] = useState('profile');

  const [orgSettings, setOrgSettings] = useState({
    name: '',
    requireSessionApproval: true,
    allowFileTransfer: true,
    allowChat: true,
    allowRecording: false,
  });
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgSaving, setOrgSaving] = useState(false);

  useEffect(() => {
    if (activeTab !== 'organization') return;
    setOrgLoading(true);
    organizationApi.getSettings()
      .then(data => setOrgSettings({
        name: data.name ?? '',
        requireSessionApproval: data.requireSessionApproval,
        allowFileTransfer: data.allowFileTransfer,
        allowChat: data.allowChat,
        allowRecording: data.allowRecording,
      }))
      .catch(() => toast.error('Failed to load organization settings'))
      .finally(() => setOrgLoading(false));
  }, [activeTab]);

  const handleOrgSave = async () => {
    setOrgSaving(true);
    try {
      const updated = await organizationApi.updateSettings(orgSettings);
      setOrgSettings({
        name: updated.name ?? '',
        requireSessionApproval: updated.requireSessionApproval,
        allowFileTransfer: updated.allowFileTransfer,
        allowChat: updated.allowChat,
        allowRecording: updated.allowRecording,
      });
      toast.success('Organization settings saved');
    } catch {
      toast.error('Failed to save organization settings');
    } finally {
      setOrgSaving(false);
    }
  };

  const TABS = [
    { id: 'profile', label: 'Profile', icon: Users },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    ...(user?.role === 'org_admin' || user?.role === 'super_admin' ? [
      { id: 'organization', label: 'Organization', icon: Building },
      { id: 'api', label: 'API Keys', icon: Key },
    ] : []),
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary-400" />
          Settings
        </h1>
      </div>

      <div className="flex gap-6">
        {/* Tab nav */}
        <div className="w-48 flex-shrink-0">
          <nav className="space-y-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-600/20 text-primary-400'
                    : 'text-slate-400 hover:bg-dark-700 hover:text-slate-200'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 card">
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-white">Profile Settings</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">First Name</label>
                  <input className="input" defaultValue={user?.firstName} />
                </div>
                <div>
                  <label className="label">Last Name</label>
                  <input className="input" defaultValue={user?.lastName} />
                </div>
              </div>
              <div>
                <label className="label">Display Name</label>
                <input className="input" defaultValue={user?.displayName} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" defaultValue={user?.email} disabled />
                <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
              </div>
              <button className="btn-primary">Save Changes</button>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-white">Security Settings</h3>
              <div className="space-y-3">
                <div>
                  <label className="label">Current Password</label>
                  <input type="password" className="input" placeholder="••••••••" />
                </div>
                <div>
                  <label className="label">New Password</label>
                  <input type="password" className="input" placeholder="••••••••" />
                </div>
                <div>
                  <label className="label">Confirm New Password</label>
                  <input type="password" className="input" placeholder="••••••••" />
                </div>
              </div>
              <button className="btn-primary">Update Password</button>

              <div className="border-t border-dark-700 pt-4 mt-6">
                <h4 className="font-medium text-white mb-2">Two-Factor Authentication</h4>
                <p className="text-sm text-slate-400 mb-3">
                  Add an extra layer of security to your account.
                </p>
                <button className="btn-secondary">Enable 2FA</button>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-white">Notification Preferences</h3>
              {[
                { key: 'session_request', label: 'New session requests', desc: 'Notify when a user requests support' },
                { key: 'session_started', label: 'Session started', desc: 'When your session is approved' },
                { key: 'session_ended', label: 'Session ended', desc: 'When a remote session ends' },
                { key: 'device_offline', label: 'Device goes offline', desc: 'When a monitored device disconnects' },
              ].map(item => (
                <label key={item.key} className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="mt-1 w-4 h-4 accent-primary-600" />
                  <div>
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.desc}</p>
                  </div>
                </label>
              ))}
              <button className="btn-primary">Save Preferences</button>
            </div>
          )}

          {activeTab === 'organization' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-white">Organization Settings</h3>
              {orgLoading ? (
                <p className="text-sm text-slate-400">Loading...</p>
              ) : (
                <>
                  <div>
                    <label className="label">Organization Name</label>
                    <input
                      className="input"
                      value={orgSettings.name}
                      onChange={e => setOrgSettings(s => ({ ...s, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-3">
                    {([
                      { key: 'requireSessionApproval', label: 'Require session approval', desc: 'Users must approve before technician can connect' },
                      { key: 'allowFileTransfer', label: 'Allow file transfer', desc: 'Enable file transfer between technician and user' },
                      { key: 'allowChat', label: 'Allow chat', desc: 'Enable real-time chat during sessions' },
                      { key: 'allowRecording', label: 'Allow session recording', desc: 'Technicians can record remote sessions' },
                    ] as const).map(s => (
                      <label key={s.key} className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={orgSettings[s.key]}
                          onChange={e => setOrgSettings(prev => ({ ...prev, [s.key]: e.target.checked }))}
                          className="mt-1 w-4 h-4 accent-primary-600"
                        />
                        <div>
                          <p className="text-sm font-medium text-white">{s.label}</p>
                          <p className="text-xs text-slate-500">{s.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <button className="btn-primary" onClick={handleOrgSave} disabled={orgSaving}>
                    {orgSaving ? 'Saving...' : 'Save Organization Settings'}
                  </button>
                </>
              )}
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">API Keys</h3>
                <button className="btn-primary text-xs">Generate New Key</button>
              </div>
              <div className="card p-4 text-center text-slate-500 text-sm">
                <Key className="w-8 h-8 mx-auto mb-2 text-slate-700" />
                No API keys yet. Generate one to access the API programmatically.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
