import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { TakeControlAgent } from './agent';
import { AgentLogger } from './logger';

const isDev = process.env.NODE_ENV === 'development';

// Load root .env so TC_SERVER_URL, TC_ORG_TOKEN etc. are available in dev
// without requiring dotenv as a dependency.
// In production the user supplies env vars or agent.config.json instead.
if (isDev) {
  try {
    // dist/main.js → apps/desktop/dist → apps/desktop → apps → root
    // dist/main.js → apps/desktop/dist → apps/desktop → apps → root
    const envPath = path.join(__dirname, '..', '..', '..', '.env');
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').trim();
      }
    }
  } catch { /* no .env file — that's fine */ }
}

interface AgentConfig { serverUrl?: string; orgToken?: string; email?: string; password?: string; }

function readConfigFile(): AgentConfig | null {
  const locations = [
    path.join(app.getPath('userData'), 'agent.config.json'),
    path.join(process.execPath, '..', 'agent.config.json'),
    path.join(__dirname, '..', 'agent.config.json'),
  ];
  for (const loc of locations) {
    try {
      if (fs.existsSync(loc)) {
        return JSON.parse(fs.readFileSync(loc, 'utf8'));
      }
    } catch {}
  }
  return null;
}
const logger = new AgentLogger();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let agent: TakeControlAgent | null = null;

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('TakeControl Agent');

  const updateMenu = () => {
    const status = agent?.getStatus() ?? 'stopped';
    const contextMenu = Menu.buildFromTemplate([
      { label: 'TakeControl Agent', enabled: false },
      { type: 'separator' },
      { label: `Status: ${status}`, enabled: false },
      { label: 'Show', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { type: 'separator' },
      { label: 'Restart Agent', click: () => agent?.restart() },
      { type: 'separator' },
      { label: 'Quit', click: () => { agent?.stop(); app.quit(); } },
    ]);
    tray!.setContextMenu(contextMenu);
  };

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  updateMenu();
  return updateMenu;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 640,
    minWidth: 380,
    minHeight: 480,
    show: false,
    title: 'TakeControl Agent',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      // __dirname in compiled dist/main.js → dist/
      // preload.js compiles to dist/preload.js → same folder
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox:false required for contextBridge + require() in preload
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const rendererPath = path.join(__dirname, 'renderer', 'index.html');
    mainWindow.loadFile(rendererPath).catch((err: Error) => {
      logger.error('Failed to load renderer', err);
      dialog.showErrorBox('TakeControl', `UI load failed:\n${err.message}\n\nPath: ${rendererPath}`);
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // Fallback show after 3s
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
  }, 3000);

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow?.hide();
  });
}

function setupIPC() {
  ipcMain.handle('agent:get-status',         () => agent?.getStatus());
  ipcMain.handle('agent:get-device-info',    () => agent?.getDeviceInfo());
  ipcMain.handle('agent:get-active-session', () => agent?.getActiveSession());
  ipcMain.handle('session:approve',  (_, id: string)             => agent?.approveSession(id));
  ipcMain.handle('session:reject',   (_, id: string, r?: string) => agent?.rejectSession(id, r));
  ipcMain.handle('session:end',      (_, id: string)             => agent?.endSession(id));
  ipcMain.handle('control:revoke',   ()                          => agent?.revokeControl());
  ipcMain.handle('agent:restart',    ()                          => agent?.restart());
  ipcMain.handle('app:get-version',  ()                          => app.getVersion());
  ipcMain.handle('update:install',   ()                          => {});

  // WebRTC: renderer → main → server (renderer has RTCPeerConnection, main has Socket.IO)
  ipcMain.on('rtc:send-answer',    (_, data) => agent?.sendRtcSignal('rtc:answer',        data));
  ipcMain.on('rtc:send-offer',     (_, data) => agent?.sendRtcSignal('rtc:offer',         data));
  ipcMain.on('rtc:send-ice',       (_, data) => agent?.sendRtcSignal('rtc:ice_candidate', data));

  // Screen sources for renderer to use with getUserMedia
  ipcMain.handle('screen:get-sources', async () => {
    const { desktopCapturer } = await import('electron');
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources.map(s => ({ id: s.id, name: s.name }));
  });
}

app.whenReady().then(async () => {
  setupIPC();
  createWindow();
  const updateTrayMenu = createTray();

  // Config lookup order: env → config file → default
  const cfg = readConfigFile();
  const serverUrl = process.env.TC_SERVER_URL ?? cfg?.serverUrl ?? 'http://localhost:4000';

  // orgToken can be: JWT string, "email:password" for auto-login, or from config file
  const email    = process.env.TC_AGENT_EMAIL    ?? cfg?.email;
  const password = process.env.TC_AGENT_PASSWORD ?? cfg?.password;
  const orgToken = process.env.TC_ORG_TOKEN      ?? cfg?.orgToken
    ?? (email && password ? `${email}:${password}` : '');

  // ─── Device ID persistence ───────────────────────────────────────────────
  const deviceDataPath = path.join(app.getPath('userData'), 'device.json');
  const savedDeviceId: string | undefined = (() => {
    try { return JSON.parse(fs.readFileSync(deviceDataPath, 'utf8')).deviceId; } catch { return undefined; }
  })();

  agent = new TakeControlAgent({
    serverUrl,
    orgToken,
    savedDeviceId,
    onDeviceRegistered: (deviceId) => {
      try { fs.writeFileSync(deviceDataPath, JSON.stringify({ deviceId })); } catch {}
    },
    sendToRenderer: (channel, data) => mainWindow?.webContents.send(channel, data),
    onStatusChange: (status) => {
      mainWindow?.webContents.send('agent:status-change', status);
      updateTrayMenu();
    },
    onSessionRequest: (data) => {
      mainWindow?.webContents.send('session:request', data);
      mainWindow?.show();
      mainWindow?.focus();
    },
    onSessionStart:  (session) => mainWindow?.webContents.send('session:started', session),
    onSessionEnd:    (reason)  => mainWindow?.webContents.send('session:ended', { reason }),
    onControlChange: (mode)    => mainWindow?.webContents.send('control:changed', { mode }),
  });

  await agent.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => { /* stay in tray */ });
app.on('before-quit', () => { agent?.stop(); });

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
  dialog.showErrorBox('TakeControl Agent Error', err.message);
});
