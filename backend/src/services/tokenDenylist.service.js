// backend/src/services/tokenDenylist.service.js
const cacheService = require('./cache.service');

const DENYLIST_PREFIX = 'bl:';

/**
 * Checks if the authentication denylist should fail-closed when Redis is unavailable.
 * Default is false (fail-open: prioritize availability over strict revocation enforcement).
 *
 * SECURITY TRADE-OFF:
 * - Fail-open (AUTH_DENYLIST_FAIL_CLOSED=false):
 *   If Redis is down, authentication continues and users can still access the platform.
 *   However, any token that was logged out (revoked) might still be accepted until its
 *   JWT exp timestamp naturally elapses.
 * - Fail-closed (AUTH_DENYLIST_FAIL_CLOSED=true):
 *   If Redis is down, token revocation cannot be checked, so requests are denied (401).
 *   This ensures absolute revocation security, but causes authentication downtime if Redis fails.
 *
 * @returns {boolean}
 */
function isDenylistFailClosed() {
  return process.env.AUTH_DENYLIST_FAIL_CLOSED === 'true';
}

/**
 * Adds a token's JTI to the Redis denylist with a TTL matching its remaining validity.
 * Never stores the raw JWT token string.
 *
 * @param {string} jti - Unique JWT ID
 * @param {number} [exp] - JWT expiration timestamp (in seconds)
 * @returns {Promise<boolean>}
 */
async function denyToken(jti, exp) {
  if (!jti) return false;
  if (!cacheService.isReady()) {
    // If Redis is disabled or offline, return true so logout still succeeds (204)
    return true;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const ttlSec = exp ? Math.max(1, exp - nowSec) : 86400; // Default to 24h if no exp

  const cacheKey = `${DENYLIST_PREFIX}${jti}`;
  try {
    return await cacheService.setJSON(cacheKey, { revokedAt: nowSec }, ttlSec);
  } catch (err) {
    console.warn('[TokenDenylist] Failed to store JTI in denylist:', err.message);
    return false;
  }
}

/**
 * Checks if a token's JTI is in the denylist.
 *
 * @param {string} jti - Unique JWT ID
 * @returns {Promise<{ isDenied: boolean, error?: string }>}
 */
async function isTokenDenied(jti) {
  if (!jti) {
    // Tokens issued before this change have no jti and are not denied
    return { isDenied: false };
  }

  // If Redis is down / not ready
  if (!cacheService.isReady()) {
    if (isDenylistFailClosed()) {
      console.warn('[TokenDenylist] Redis offline & AUTH_DENYLIST_FAIL_CLOSED=true: rejecting authentication');
      return {
        isDenied: true,
        error: 'Authentication service temporarily unavailable; cannot verify revocation status'
      };
    }
    // Fail-open default: log warning and proceed
    console.warn('[TokenDenylist] Redis offline & AUTH_DENYLIST_FAIL_CLOSED=false: failing open, token revocation cannot be verified');
    return { isDenied: false };
  }

  const cacheKey = `${DENYLIST_PREFIX}${jti}`;
  try {
    const record = await cacheService.getJSON(cacheKey);
    if (record) {
      console.debug(`[TokenDenylist] HIT: Token with JTI ${jti} is revoked`);
      return { isDenied: true, error: 'Not authorized, token has been revoked' };
    }
    return { isDenied: false };
  } catch (err) {
    if (isDenylistFailClosed()) {
      return {
        isDenied: true,
        error: 'Authentication service temporarily unavailable; cannot verify revocation status'
      };
    }
    return { isDenied: false };
  }
}

module.exports = {
  denyToken,
  isTokenDenied,
  isDenylistFailClosed,
  DENYLIST_PREFIX
};

