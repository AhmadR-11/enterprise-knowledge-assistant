// backend/src/services/redis.client.js
const Redis = require('ioredis');

let client = null;
let lastLoggedErrorTime = 0;
const ERROR_LOG_THROTTLE_MS = 30000; // Throttle error logs to at most once per 30 seconds

/**
 * Rate-limited logger to avoid log flooding when Redis is offline or timing out.
 */
function logRedisWarningThrottled(context, error) {
  const now = Date.now();
  if (now - lastLoggedErrorTime > ERROR_LOG_THROTTLE_MS) {
    console.warn(`[Redis] ${context}: ${error?.message || error} (subsequent Redis warnings throttled for 30s)`);
    lastLoggedErrorTime = now;
  } else {
    // Keep high-frequency failures in debug mode
    if (process.env.DEBUG_REDIS === 'true') {
      console.debug(`[Redis] ${context} (throttled):`, error?.message || error);
    }
  }
}

/**
 * Checks whether Redis is explicitly enabled via environment variable.
 * @returns {boolean}
 */
function isRedisEnabled() {
  return process.env.REDIS_ENABLED === 'true';
}

/**
 * Returns the singleton Redis client instance or null if disabled.
 * Uses lazy connection and strict fail-open timeout settings.
 * @returns {Redis|null}
 */
function getRedisClient() {
  if (!isRedisEnabled()) {
    return null;
  }

  if (client) {
    return client;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const keyPrefix = process.env.REDIS_KEY_PREFIX || 'cortex:';

  try {
    client = new Redis(redisUrl, {
      keyPrefix,
      lazyConnect: true,
      commandTimeout: 150, // Short command timeout ~150ms
      connectTimeout: 500,
      enableOfflineQueue: false, // FAIL-OPEN: commands fail fast when disconnected
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        // Backoff with ceiling of 2000ms
        return Math.min(times * 100, 2000);
      }
    });

    client.on('connect', () => {
      console.log('[Redis] Connected to Redis instance');
    });

    client.on('ready', () => {
      console.log('[Redis] Redis client is ready to accept commands');
    });

    client.on('error', (err) => {
      logRedisWarningThrottled('Redis client error', err);
    });

    client.on('close', () => {
      if (process.env.DEBUG_REDIS === 'true') {
        console.debug('[Redis] Connection closed');
      }
    });

    // Initiate lazy connection in background
    client.connect().catch((err) => {
      logRedisWarningThrottled('Initial connection failed', err);
    });

    return client;
  } catch (initErr) {
    logRedisWarningThrottled('Failed to instantiate Redis client', initErr);
    return null;
  }
}

/**
 * Checks if Redis is currently connected, ready and enabled.
 * @returns {boolean}
 */
function isRedisReady() {
  if (!isRedisEnabled() || !client) {
    return false;
  }
  return client.status === 'ready';
}

/**
 * Gracefully closes the Redis connection on shutdown.
 */
async function closeRedis() {
  if (!client) return;
  try {
    console.log('[Redis] Gracefully closing Redis connection...');
    await client.quit();
  } catch (err) {
    try {
      client.disconnect();
    } catch {}
  } finally {
    client = null;
  }
}

/**
 * Internal helper for testing: manually inject client or reset.
 */
function _setRedisClientForTesting(mockClient) {
  client = mockClient;
}

module.exports = {
  getRedisClient,
  isRedisEnabled,
  isRedisReady,
  closeRedis,
  logRedisWarningThrottled,
  _setRedisClientForTesting
};

