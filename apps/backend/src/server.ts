import http from 'http';
import { createApp } from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { SocketGateway } from './websocket/socket.gateway';

async function bootstrap() {
  const app = createApp();
  const server = http.createServer(app);

  const gateway = new SocketGateway(server);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    server.close(async () => {
      try {
        const { default: prisma } = await import('./lib/prisma');
        const { default: redis } = await import('./lib/redis');
        await prisma.$disconnect();
        await redis.quit();
        logger.info('Server shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown', { error: err });
        process.exit(1);
      }
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
    process.exit(1);
  });

  server.listen(config.BACKEND_PORT, config.BACKEND_HOST, () => {
    logger.info(`
╔══════════════════════════════════════════════╗
║          TakeControl Backend Server          ║
╠══════════════════════════════════════════════╣
║  Environment: ${config.NODE_ENV.padEnd(29)}║
║  Port:        ${String(config.BACKEND_PORT).padEnd(29)}║
║  API:         ${`${config.API_URL}/api/v1`.padEnd(29)}║
╚══════════════════════════════════════════════╝
    `);
  });

  return { server, gateway };
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
