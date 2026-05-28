import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 10) return null;
    return Math.min(times * 200, 2000);
  },
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));
redis.on('close', () => logger.warn('Redis connection closed'));

// Pub/Sub clients for WebSocket fanout
export const redisPub = new Redis(config.REDIS_URL);
export const redisSub = new Redis(config.REDIS_URL);

// ─── Cache helpers ────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  const value = await redis.get(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as unknown as T;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const serialized = JSON.stringify(value);
  if (ttlSeconds) {
    await redis.setex(key, ttlSeconds, serialized);
  } else {
    await redis.set(key, serialized);
  }
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length) await redis.del(...keys);
}

// ─── Session presence ─────────────────────────────────────────────

export const ONLINE_DEVICES_KEY = 'online:devices';
export const ONLINE_TECHNICIANS_KEY = 'online:technicians';
export const ACTIVE_SESSIONS_KEY = 'active:sessions';

export async function setDeviceOnline(deviceId: string, socketId: string): Promise<void> {
  await redis.hset(ONLINE_DEVICES_KEY, deviceId, socketId);
  await redis.expire(ONLINE_DEVICES_KEY, 86400);
}

export async function setDeviceOffline(deviceId: string): Promise<void> {
  await redis.hdel(ONLINE_DEVICES_KEY, deviceId);
}

export async function getDeviceSocket(deviceId: string): Promise<string | null> {
  return redis.hget(ONLINE_DEVICES_KEY, deviceId);
}

export async function getOnlineDeviceIds(): Promise<string[]> {
  const map = await redis.hgetall(ONLINE_DEVICES_KEY);
  return Object.keys(map);
}

export default redis;
