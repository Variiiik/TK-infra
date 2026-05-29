import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';

import { config, corsOrigins, isDev } from './config';
import { logger } from './lib/logger';
import { notFound, errorHandler } from './middleware/error.middleware';

// Routes
import authRoutes from './modules/auth/auth.routes';
import sessionRoutes from './modules/session/session.routes';
import userRoutes from './modules/user/user.routes';
import deviceRoutes from './modules/device/device.routes';
import auditRoutes from './modules/audit/audit.routes';
import downloadRoutes from './modules/download/download.routes';
import orgRoutes from './modules/org/org.routes';

export function createApp() {
  const app = express();

  // ─── Security ──────────────────────────────────────────────────
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: isDev ? false : undefined,
  }));

  app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  }));

  // ─── Rate Limiting ─────────────────────────────────────────────
  app.use(rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
  }));

  // ─── Parsing ───────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());
  app.use(compression());

  // ─── Logging ───────────────────────────────────────────────────
  app.use(morgan(isDev ? 'dev' : 'combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
    skip: (req) => req.path === '/health',
  }));

  // ─── Request ID ────────────────────────────────────────────────
  app.use((req, res, next) => {
    req.headers['x-request-id'] ??= crypto.randomUUID();
    res.setHeader('X-Request-ID', req.headers['x-request-id']);
    next();
  });

  // ─── Static uploads ────────────────────────────────────────────
  app.use('/uploads', express.static(path.resolve(config.UPLOAD_PATH)));

  // ─── Health check ──────────────────────────────────────────────
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
      uptime: process.uptime(),
    });
  });

  // ─── API Routes ────────────────────────────────────────────────
  const apiPrefix = '/api/v1';
  app.use(`${apiPrefix}/auth`, authRoutes);
  app.use(`${apiPrefix}/sessions`, sessionRoutes);
  app.use(`${apiPrefix}/users`, userRoutes);
  app.use(`${apiPrefix}/devices`, deviceRoutes);
  app.use(`${apiPrefix}/audit`, auditRoutes);
  app.use(`${apiPrefix}/organizations`, orgRoutes);

  // ─── Public download page (no auth needed) ────────────────────
  app.use('/', downloadRoutes);

  // ─── Error handling ────────────────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
