import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

const AGENT_VERSION = process.env.AGENT_VERSION ?? '1.0.0';
const BASE_URL = process.env.API_URL ?? 'http://localhost:4000';

// Download page — saadad kliendile selle lingi
router.get('/download', asyncHandler(async (req, res) => {
  const ua = req.headers['user-agent'] ?? '';

  const isWindows = ua.includes('Windows');
  const isMac     = ua.includes('Macintosh') || ua.includes('Mac OS');
  const isLinux   = ua.includes('Linux');

  const downloads = {
    windows: `${BASE_URL}/agent/TakeControl-Setup-${AGENT_VERSION}.exe`,
    mac:     `${BASE_URL}/agent/TakeControl-${AGENT_VERSION}.dmg`,
    linux:   `${BASE_URL}/agent/TakeControl-${AGENT_VERSION}.AppImage`,
  };

  // Autoredirect kui OS tuvastatud
  const autoRedirect = isWindows ? downloads.windows
    : isMac ? downloads.mac
    : isLinux ? downloads.linux
    : null;

  res.send(`<!DOCTYPE html>
<html lang="et">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>TakeControl — Laadi agent alla</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#0f172a;color:#f1f5f9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:40px;max-width:480px;width:100%;text-align:center}
    .logo{width:56px;height:56px;background:#4f46e5;border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:24px}
    h1{font-size:22px;font-weight:700;margin-bottom:8px}
    p{color:#94a3b8;font-size:14px;line-height:1.6;margin-bottom:24px}
    .btn{display:block;width:100%;padding:14px 20px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;border:none;cursor:pointer;margin-bottom:10px;transition:opacity .15s}
    .btn-primary{background:#4f46e5;color:#fff}
    .btn-primary:hover{opacity:.9}
    .btn-secondary{background:#334155;color:#e2e8f0;font-size:13px}
    .btn-secondary:hover{opacity:.9}
    .info{font-size:12px;color:#64748b;margin-top:16px}
    .os-badge{display:inline-block;background:#0f172a;border:1px solid #334155;border-radius:20px;padding:4px 12px;font-size:12px;color:#94a3b8;margin-bottom:20px}
    .steps{text-align:left;background:#0f172a;border-radius:10px;padding:16px 20px;margin-bottom:20px}
    .steps li{font-size:13px;color:#94a3b8;margin-bottom:8px;padding-left:4px}
    .steps li::marker{color:#4f46e5}
  </style>
  ${autoRedirect ? `<meta http-equiv="refresh" content="3;url=${autoRedirect}"/>` : ''}
</head>
<body>
  <div class="card">
    <div class="logo">⚡</div>
    <h1>TakeControl Agent</h1>

    <div class="os-badge">
      ${isWindows ? '🪟 Windows tuvastatud' : isMac ? '🍎 macOS tuvastatud' : isLinux ? '🐧 Linux tuvastatud' : '💻 Vali operatsioonisüsteem'}
    </div>

    <p>Laadi alla TakeControl agent, et lubada tehnikul sinu arvutit aidata.</p>

    <ol class="steps">
      <li>Laadi alla ja installi agent</li>
      <li>Agent käivitub automaatselt</li>
      <li>Kinnita tehnikute ühendumissoov</li>
      <li>Sul on täielik kontroll — saad igal ajal ühenduse katkestada</li>
    </ol>

    ${autoRedirect ? `
    <a href="${autoRedirect}" class="btn btn-primary">⬇️ Laadi alla (${isWindows?'Windows':isMac?'macOS':'Linux'})</a>
    <p style="font-size:12px;color:#64748b">Allalaadimine algab automaatselt 3 sekundi pärast...</p>
    ` : `
    <a href="${downloads.windows}" class="btn btn-primary">🪟 Windows installer (.exe)</a>
    <a href="${downloads.mac}" class="btn btn-secondary">🍎 macOS (.dmg)</a>
    <a href="${downloads.linux}" class="btn btn-secondary">🐧 Linux (.AppImage)</a>
    `}

    <p class="info">✅ Turvaline · Krüpteeritud · Klient kontrollib alati sessiooni</p>
  </div>
</body>
</html>`);
}));

// Serveerib installer failid
router.use('/agent', (req, res, next) => {
  const agentDir = process.env.AGENT_FILES_PATH ?? './agent-releases';
  require('express').static(agentDir)(req, res, next);
});

export default router;
