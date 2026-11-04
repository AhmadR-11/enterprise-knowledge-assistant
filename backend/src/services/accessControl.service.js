// backend/src/services/accessControl.service.js
const cacheService = require('./cache.service');
const userModel = require('../models/postgres/user.model');
const userSpaceModel = require('../models/postgres/userSpace.model');

// In-memory fallback version when Redis is offline or disabled
let localAccessVersion = 1;

const ACCESS_CACHE_TTL_SEC = 120; // 120 seconds TTL

/**
 * Retrieves the current global access version counter.
 * Uses atomic Redis key `access:version` with local in-memory fallback.
 * @returns {Promise<number>}
 */
async function getAccessVersion() {
  if (cacheService.isReady()) {
    try {
      const v = await cacheService.getJSON('access:version');
      if (typeof v === 'number' && v > 0) {
        return v;
      }
      // Initialize if not present
      await cacheService.setJSON('access:version', localAccessVersion, 86400 * 30);
      return localAccessVersion;
    } catch {
      // Fail-open
    }
  }
  return localAccessVersion;
}

/**
 * Atomically increments the global access version counter.
 * Instantly invalidates all cached access records without scanning keys.
 * @returns {Promise<number>}
 */
async function invalidateAllAccess() {
  localAccessVersion += 1;
  console.debug(`[AccessCache] Invalidate ALL user access called (bumping version to ${localAccessVersion})`);

  if (cacheService.isReady()) {
    try {
      const res = await cacheService.incr('access:version', 86400 * 30);
      if (res?.count) {
        return res.count;
      }
    } catch (err) {
      console.warn('[AccessCache] Failed to increment access:version in Redis:', err.message);
    }
  }
  return localAccessVersion;
}

/**
 * Invalidates cached access permissions for a specific user ID.
 * @param {number|string} userId
 * @returns {Promise<void>}
 */
async function invalidateUserAccess(userId) {
  if (!userId) return;
  const uId = parseInt(userId, 10);
  console.debug(`[AccessCache] Invalidate access for user ${uId}`);

  if (cacheService.isReady()) {
    try {
      const version = await getAccessVersion();
      const versionedKey = `access:v${version}:${uId}`;
      const legacyKey = `access:${uId}`;
      await cacheService.del([versionedKey, legacyKey]);
    } catch (err) {
      console.warn(`[AccessCache] Failed to delete cache for user ${uId}:`, err.message);
    }
  }
}

/**
 * Retrieves base access rights (role + sorted space IDs) for a user.
 * Cached in Redis under `access:v<version>:<userId>` with 120s TTL.
 * Fail-open: falls back to PostgreSQL on any Redis issue.
 *
 * @param {Object} user - { id, role }
 * @returns {Promise<{ role: string, spaceIds: number[] }>}
 */
async function getUserAccess(user) {
  if (!user || !user.id) {
    return { role: 'viewer', spaceIds: [] };
  }

  const userId = parseInt(user.id, 10);
  const version = await getAccessVersion();
  const cacheKey = `access:v${version}:${userId}`;

  // 1. Check cache first
  if (cacheService.isReady()) {
    try {
      const cached = await cacheService.getJSON(cacheKey);
      if (cached && typeof cached === 'object' && cached.role && Array.isArray(cached.spaceIds)) {
        console.debug(`[AccessCache] HIT: user ${userId} (role: ${cached.role}, spaces: [${cached.spaceIds.join(', ')}])`);
        return cached;
      }
    } catch {
      // Fail-open
    }
    console.debug(`[AccessCache] MISS: user ${userId} (key: ${cacheKey})`);
  }

  // 2. Fetch fresh user role from PostgreSQL to guarantee consistency
  let currentRole = user.role;
  try {
    const dbUser = await userModel.findUserById(userId);
    if (dbUser?.role) {
      currentRole = dbUser.role;
    }
  } catch (err) {
    console.warn(`[AccessCache] DB user lookup failed for ${userId}, falling back to request role:`, err.message);
  }

  // 3. Resolve accessible space IDs
  let sortedSpaceIds = [];
  if (currentRole !== 'admin') {
    try {
      const userSpaces = await userSpaceModel.listSpacesForUser(userId);
      if (Array.isArray(userSpaces)) {
        sortedSpaceIds = [...userSpaces].map(Number).sort((a, b) => a - b);
      }
    } catch (err) {
      console.error(`[AccessCache] Failed to list spaces for user ${userId}:`, err.message);
      throw err;
    }
  }

  const accessPayload = {
    role: currentRole,
    spaceIds: sortedSpaceIds
  };

  // 4. Cache in Redis with 120s TTL (fail-open)
  if (cacheService.isReady()) {
    try {
      await cacheService.setJSON(cacheKey, accessPayload, ACCESS_CACHE_TTL_SEC);
    } catch {
      // Fail-open
    }
  }

  return accessPayload;
}

/**
 * Resolves space authorization for the requesting user.
 * Shared between synchronous and streaming chat handlers.
 *
 * @param {Object} user - Authenticated user object from req.user
 * @param {string|number} [spaceId] - Optional spaceId from request body
 * @returns {Promise<{ targetSpaceIds?: number[] | null, error?: { status: number, code: string, message: string } }>}
 */
const resolveChatAccess = async (user, spaceId) => {
  const access = await getUserAccess(user);
  let targetSpaceIds = null;

  if (access.role !== 'admin') {
    const userSpaces = access.spaceIds;

    if (!userSpaces || userSpaces.length === 0) {
      return {
        error: {
          status: 403,
          code: 'FORBIDDEN',
          message: 'Access Denied: You are not currently assigned to any space'
        }
      };
    }

    if (spaceId) {
      const sId = parseInt(spaceId, 10);
      if (isNaN(sId) || !userSpaces.includes(sId)) {
        return {
          error: {
            status: 403,
            code: 'FORBIDDEN',
            message: 'Access Denied: You do not have access to this space'
          }
        };
      }
      targetSpaceIds = [sId];
    } else {
      targetSpaceIds = userSpaces;
    }
  } else {
    if (spaceId) {
      const sId = parseInt(spaceId, 10);
      if (!isNaN(sId)) {
        targetSpaceIds = [sId];
      }
    }
  }

  return { targetSpaceIds };
};

/**
 * Testing helper to reset local in-memory version counter.
 */
function _resetLocalAccessVersionForTesting() {
  localAccessVersion = 1;
}

module.exports = {
  getUserAccess,
  resolveChatAccess,
  invalidateUserAccess,
  invalidateAllAccess,
  getAccessVersion,
  ACCESS_CACHE_TTL_SEC,
  _resetLocalAccessVersionForTesting
};
