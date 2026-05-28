# TakeControl — Enterprise Remote Assist Platform

> Production-ready, modular remote support platform built for enterprise teams.  
> TeamViewer / AnyDesk alternative with modern architecture.

---

## Architecture Overview

```
take-control/
├── apps/
│   ├── backend/          # Node.js + TypeScript REST API + WebSocket
│   ├── web/              # React + TypeScript dashboard
│   └── desktop/          # Electron agent (screen share + input control)
├── packages/
│   ├── shared/           # Shared types, constants, utilities
│   └── database/         # Prisma ORM schema + migrations + seed
├── infrastructure/
│   ├── nginx/            # Reverse proxy configuration
│   ├── docker/           # Docker init scripts
│   └── monitoring/       # Prometheus + Grafana
├── .github/
│   └── workflows/        # GitHub Actions CI/CD
├── scripts/
│   └── setup.js          # One-command setup wizard
├── docker-compose.yml    # Development stack
└── docker-compose.prod.yml
```

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20, TypeScript, Express, Socket.IO |
| Frontend | React 18, TypeScript, Vite, TailwindCSS, Zustand |
| Desktop Agent | Electron 28, TypeScript, robotjs |
| Database | PostgreSQL 16, Prisma ORM |
| Cache/Pub-Sub | Redis 7 |
| Screen Share | WebRTC (via Socket.IO signaling) |
| Auth | JWT (access + refresh tokens), bcrypt |
| Container | Docker, docker-compose |
| CI/CD | GitHub Actions |
| Reverse Proxy | Nginx |
| Monitoring | Prometheus + Grafana |

---

## Quick Start

### Prerequisites

- Node.js >= 18
- pnpm >= 8
- Docker + Docker Compose
- PostgreSQL 16 (or use Docker)
- Redis 7 (or use Docker)

### 1. Clone & Setup

```bash
git clone https://github.com/your-org/take-control.git
cd take-control

# One-command setup (installs deps, creates .env, runs migrations, seeds DB)
node scripts/setup.js
```

### 2. Start Development

```bash
# Start all services (DB, Redis, backend, frontend)
pnpm dev

# Or start with Docker
docker-compose up -d
```

### 3. Access

| Service | URL |
|---|---|
| Web Dashboard | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| API Docs | http://localhost:4000/api/v1 |
| Prisma Studio | `pnpm --filter @take-control/database db:studio` |

### 4. Demo Credentials

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@takecontrol.app | Admin@123456! |
| Org Admin | orgadmin@takecontrol.app | Admin@123456! |
| Technician | tech@takecontrol.app | Tech@123456! |
| User | user@takecontrol.app | User@123456! |

---

## Core Features

### For Users
- Install agent via web link (OS auto-detection)
- See who is connecting (name, company, session duration)
- Approve or reject any session request
- Revoke control at any time
- End session instantly

### For Technicians
- Dashboard with live pending requests
- Full remote screen view via WebRTC
- Mouse + keyboard control (robotjs)
- Multi-monitor switching
- Real-time chat during sessions
- Session history with audit log

### For Administrators
- Full user management (CRUD)
- Device inventory
- Session audit log
- Organization settings
- API key management
- Role-based permissions (super_admin, org_admin, technician, user)

---

## Security

- JWT access tokens (15min) + refresh tokens (7 days)
- bcrypt password hashing (cost factor 12)
- AES-256-GCM session encryption
- WebRTC end-to-end encrypted streams
- CSRF protection via SameSite cookies
- Rate limiting (express-rate-limit)
- Helmet.js security headers
- CORS whitelist
- Audit log for all sensitive actions
- Session approval workflow
- Token revocation via Redis

---

## Module System

The architecture is designed for future module addition:

```typescript
// Each module is self-contained:
// modules/chat/
// modules/file-transfer/
// modules/recording/
// modules/ai-assistant/
// modules/ticketing/

// Event bus for inter-module communication
eventBus.emit('session:started', { sessionId, ... });
eventBus.on('session:started', (data) => { /* module logic */ });
```

Planned modules (structure ready, implementation pending):
- [ ] Chat (WebSocket, persisted)
- [ ] File Transfer (chunked, progress tracking)
- [ ] Session Recording (WebM, S3 storage)
- [ ] AI Assistant (Claude API integration)
- [ ] Ticketing System
- [ ] Voice/Video (WebRTC audio/video tracks)
- [ ] Multi-tenant White-labeling

---

## API Reference

### Authentication
```
POST /api/v1/auth/login          — Login
POST /api/v1/auth/refresh        — Refresh token
POST /api/v1/auth/logout         — Logout
GET  /api/v1/auth/me             — Current user
POST /api/v1/auth/password/request-reset
POST /api/v1/auth/password/reset
```

### Sessions
```
GET  /api/v1/sessions            — List sessions
GET  /api/v1/sessions/stats      — Dashboard stats
GET  /api/v1/sessions/requests/pending
POST /api/v1/sessions/requests   — Create support request
POST /api/v1/sessions/requests/:id/accept
GET  /api/v1/sessions/:id
POST /api/v1/sessions/:id/approve
POST /api/v1/sessions/:id/reject
POST /api/v1/sessions/:id/end
POST /api/v1/sessions/:id/control
POST /api/v1/sessions/:id/monitor
```

### Devices
```
GET    /api/v1/devices
GET    /api/v1/devices/:id
PATCH  /api/v1/devices/:id
DELETE /api/v1/devices/:id
```

### Users (admin)
```
GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/:id
PATCH  /api/v1/users/:id
DELETE /api/v1/users/:id
```

### Audit
```
GET /api/v1/audit
```

---

## WebSocket Events

Events are typed in `packages/shared/src/constants/index.ts`.

Key flows:
```
Agent connects → device:register → device:registered
Technician accepts request → session:start (join room)
User approves → session:approved → WebRTC offer/answer exchange
Control transfer: session:control_transfer
Input forwarding: input:mouse_move, input:mouse_click, input:key_press
```

---

## Desktop Agent

The Electron agent:
1. Connects to server via Socket.IO
2. Registers device (OS info, monitors, hardware)
3. Shows system tray icon
4. Shows approval dialog when technician requests access
5. Streams screen via WebRTC (desktopCapturer)
6. Forwards mouse/keyboard events via robotjs
7. Auto-updates via electron-updater

### Build Agent

```bash
cd apps/desktop
pnpm dist:win    # Windows NSIS installer
pnpm dist:mac    # macOS DMG
pnpm dist:linux  # Linux AppImage + DEB
```

---

## Production Deployment

### Docker Compose

```bash
cp .env.example .env
# Edit .env with production values

docker-compose -f docker-compose.prod.yml up -d
docker-compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

### Environment Variables

See `.env.example` for all required variables. Required for production:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Min 32 chars, random
- `JWT_REFRESH_SECRET` — Min 32 chars, random
- `ENCRYPTION_KEY` — Exactly 32 chars

### Kubernetes

Kubernetes manifests are in `infrastructure/k8s/` (coming soon).

---

## Development Commands

```bash
pnpm dev                    # Start all services
pnpm build                  # Build all packages
pnpm test                   # Run all tests
pnpm lint                   # Lint all packages
pnpm db:migrate             # Run migrations
pnpm db:seed                # Seed demo data
pnpm docker:up              # Start Docker stack
pnpm docker:down            # Stop Docker stack
```

---

## License

MIT — See LICENSE file.

---

Built with ❤️ for enterprise IT teams.
