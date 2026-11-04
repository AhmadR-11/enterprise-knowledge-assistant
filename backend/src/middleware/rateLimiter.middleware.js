// backend/src/middleware/rateLimiter.middleware.js
const cacheService = require('../services/cache.service');

// Process-local in-memory store for graceful fallback when Redis is offline
const inMemoryStore = new Map();

// Periodic cleanup of expired in-memory entries every 60 seconds
const memoryCleaner = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of inMemoryStore.entries()) {
    if (now >= v.resetAt) {
      inMemoryStore.delete(k);
    }
  }
}, 60000);
if (memoryCleaner.unref) {
  memoryCleaner.unref();
}

/**
 * Normalizes client IP address from express req.
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Checks and updates in-memory rate limit counter.
 */
function checkInMemoryLimit(key, max, windowSec) {
  const now = Date.now();
  const existing = inMemoryStore.get(key);

  if (!existing || now >= existing.resetAt) {
    const resetAt = now + windowSec * 1000;
    inMemoryStore.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      count: 1,
      remaining: Math.max(0, max - 1),
      retryAfter: 0,
      resetAtSec: Math.ceil(resetAt / 1000)
    };
  }

  existing.count += 1;
  const remaining = Math.max(0, max - existing.count);
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  const resetAtSec = Math.ceil(existing.resetAt / 1000);

  return {
    allowed: existing.count <= max,
    count: existing.count,
    remaining,
    retryAfter,
    resetAtSec
  };
}

/**
 * Factory for creating express rate-limiter middleware.
 * Uses Redis atomic INCR+EXPIRE with automatic fallback to in-memory store.
 *
 * @param {Object} options
 * @param {string} options.scope - Prefix for rate limit keys (e.g. 'chat', 'auth')
 * @param {number} options.defaultWindowSec - Window duration in seconds
 * @param {number} options.defaultMax - Maximum allowed hits in window
 * @param {string} [options.envWindowKey] - Env var name for custom window
 * @param {string} [options.envMaxKey] - Env var name for custom max
 * @param {Function} options.keyGenerator - (req) => string identifier
 * @param {string} options.message - Friendly error message returned on 429
 */
function createRateLimiter({
  scope,
  defaultWindowSec,
  defaultMax,
  envWindowKey,
  envMaxKey,
  keyGenerator,
  message
}) {
  return async function rateLimiterMiddleware(req, res, next) {
    const windowSec = parseInt(envWindowKey && process.env[envWindowKey] ? process.env[envWindowKey] : defaultWindowSec, 10);
    const max = parseInt(envMaxKey && process.env[envMaxKey] ? process.env[envMaxKey] : defaultMax, 10);

    const clientIdentifier = keyGenerator(req);
    const rateLimitKey = `ratelimit:${scope}:${clientIdentifier}`;

    let result = null;

    // 1. Try Redis limiter first if ready
    if (cacheService.isReady()) {
      try {
        const redisIncr = await cacheService.incr(rateLimitKey, windowSec);
        if (redisIncr && typeof redisIncr.count === 'number') {
          const { count, ttlRemaining } = redisIncr;
          const retryAfter = Math.max(1, ttlRemaining || windowSec);
          const resetAtSec = Math.floor(Date.now() / 1000) + retryAfter;
          const remaining = Math.max(0, max - count);

          result = {
            allowed: count <= max,
            count,
            remaining,
            retryAfter,
            resetAtSec
          };
        }
      } catch (redisErr) {
        // Fall through to in-memory fallback
      }
    }

    // 2. Fall back gracefully to in-memory store if Redis is disabled or failed
    if (!result) {
      result = checkInMemoryLimit(rateLimitKey, max, windowSec);
    }

    // Set standard rate-limiting response headers
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', String(result.resetAtSec));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfter));
      return res.status(429).json({
        success: false,
        message: message || `Too many requests. Please wait ${result.retryAfter}s before trying again.`,
        retryAfter: result.retryAfter
      });
    }

    next();
  };
}

/**
 * Chat Rate Limiter:
 * 20 requests per minute per authenticated user (or IP if unauthenticated).
 */
const chatRateLimiter = createRateLimiter({
  scope: 'chat',
  defaultWindowSec: 60,
  defaultMax: 20,
  envWindowKey: 'RATE_LIMIT_CHAT_WINDOW_SEC',
  envMaxKey: 'RATE_LIMIT_CHAT',
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${getClientIp(req)}`),
  message: 'Chat rate limit reached (20 requests per minute). Please wait a moment before sending another message.'
});

/**
 * Auth Rate Limiter:
 * 10 requests per 15 minutes per IP.
 */
const authRateLimiter = createRateLimiter({
  scope: 'auth',
  defaultWindowSec: 900,
  defaultMax: 10,
  envWindowKey: 'RATE_LIMIT_AUTH_WINDOW_SEC',
  envMaxKey: 'RATE_LIMIT_AUTH',
  keyGenerator: (req) => `ip:${getClientIp(req)}`,
  message: 'Too many authentication attempts (10 per 15 minutes). Please wait before trying again.'
});

/**
 * Upload Rate Limiter:
 * 10 document uploads per hour per authenticated user.
 */
const uploadRateLimiter = createRateLimiter({
  scope: 'upload',
  defaultWindowSec: 3600,
  defaultMax: 10,
  envWindowKey: 'RATE_LIMIT_UPLOAD_WINDOW_SEC',
  envMaxKey: 'RATE_LIMIT_UPLOAD',
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${getClientIp(req)}`),
  message: 'Document upload limit reached (10 uploads per hour). Please try again later.'
});

/**
 * Testing helper to clear in-memory store between test cases.
 */
function _clearInMemoryStoreForTesting() {
  inMemoryStore.clear();
}

module.exports = {
  createRateLimiter,
  chatRateLimiter,
  authRateLimiter,
  uploadRateLimiter,
  getClientIp,
  _clearInMemoryStoreForTesting
};

