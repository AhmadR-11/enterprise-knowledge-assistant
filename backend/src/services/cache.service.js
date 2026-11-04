// backend/src/services/cache.service.js
const {
  getRedisClient,
  isRedisEnabled,
  isRedisReady,
  logRedisWarningThrottled
} = require('./redis.client');

/**
 * Ensures key passed to eval/Lua script has client prefix applied if needed.
 */
function resolveLuaKey(client, key) {
  const prefix = client.options?.keyPrefix || '';
  if (prefix && !key.startsWith(prefix)) {
    return `${prefix}${key}`;
  }
  return key;
}

/**
 * Checks if Redis caching is available and ready for operations.
 * @returns {boolean}
 */
function isReady() {
  return isRedisReady();
}

/**
 * Retrieves and deserializes a JSON value from Redis.
 * Fail-open: returns null if Redis is disabled, down, or times out.
 *
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function getJSON(key) {
  if (!isRedisEnabled()) return null;

  const client = getRedisClient();
  if (!client || client.status !== 'ready') return null;

  try {
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    logRedisWarningThrottled(`getJSON failed for key "${key}"`, err);
    return null; // Fail-open: proceed as a cache miss
  }
}

/**
 * Serializes and stores a JSON value in Redis with mandatory TTL.
 * CRITICAL RULE: ttlSeconds is strictly required. No key may be set without a TTL.
 *
 * @param {string} key
 * @param {any} value
 * @param {number} ttlSeconds - Positive integer expiration in seconds
 * @returns {Promise<boolean>} - true if stored, false if bypass/failure
 */
async function setJSON(key, value, ttlSeconds) {
  // Enforce mandatory TTL requirement
  if (!ttlSeconds || typeof ttlSeconds !== 'number' || ttlSeconds <= 0 || !Number.isFinite(ttlSeconds)) {
    throw new Error(`setJSON requires a valid positive ttlSeconds (received: ${ttlSeconds}). No Redis key may be stored without a TTL.`);
  }

  if (!isRedisEnabled()) return false;

  const client = getRedisClient();
  if (!client || client.status !== 'ready') return false;

  try {
    const serialized = JSON.stringify(value);
    const ttl = Math.floor(ttlSeconds);
    await client.set(key, serialized, 'EX', ttl);
    return true;
  } catch (err) {
    logRedisWarningThrottled(`setJSON failed for key "${key}"`, err);
    return false; // Fail-open
  }
}

/**
 * Deletes one or more keys from Redis.
 *
 * @param {string|string[]} keys
 * @returns {Promise<number>} Number of keys deleted
 */
async function del(keys) {
  if (!isRedisEnabled()) return 0;

  const client = getRedisClient();
  if (!client || client.status !== 'ready') return 0;

  try {
    const keyList = Array.isArray(keys) ? keys : [keys];
    if (keyList.length === 0) return 0;
    return await client.del(...keyList);
  } catch (err) {
    logRedisWarningThrottled(`del failed for keys`, err);
    return 0; // Fail-open
  }
}

/**
 * Atomically increments an integer key and sets TTL if newly created.
 *
 * @param {string} key
 * @param {number} ttlSeconds - TTL applied if the key is newly initialized
 * @returns {Promise<{ count: number, ttlRemaining: number } | null>}
 */
async function incr(key, ttlSeconds) {
  if (!ttlSeconds || typeof ttlSeconds !== 'number' || ttlSeconds <= 0) {
    throw new Error('incr requires a positive ttlSeconds.');
  }

  if (!isRedisEnabled()) return null;

  const client = getRedisClient();
  if (!client || client.status !== 'ready') return null;

  // Atomic Lua script: Increment and ensure TTL is set on key creation
  const luaScript = `
    local current = redis.call("INCR", KEYS[1])
    if current == 1 then
      redis.call("EXPIRE", KEYS[1], ARGV[1])
    end
    local ttl = redis.call("TTL", KEYS[1])
    return {current, ttl}
  `;

  try {
    const redisKey = resolveLuaKey(client, key);
    const result = await client.eval(luaScript, 1, redisKey, Math.floor(ttlSeconds));
    if (Array.isArray(result)) {
      return {
        count: Number(result[0]),
        ttlRemaining: Number(result[1]) > 0 ? Number(result[1]) : ttlSeconds
      };
    }
    return null;
  } catch (err) {
    logRedisWarningThrottled(`incr failed for key "${key}"`, err);
    return null; // Fail-open
  }
}

/**
 * Acquires a distributed lock using SET NX PX.
 * Fail-open: returns false if lock cannot be acquired or held by another process.
 *
 * @param {string} key
 * @param {string} token - Unique identifier (e.g. UUID) for lock ownership
 * @param {number} ttlSeconds - Lock auto-expiration in seconds
 * @returns {Promise<boolean>}
 */
async function acquireLock(key, token, ttlSeconds) {
  if (!ttlSeconds || typeof ttlSeconds !== 'number' || ttlSeconds <= 0) {
    throw new Error('acquireLock requires a positive ttlSeconds.');
  }

  if (!isRedisEnabled()) return false;

  const client = getRedisClient();
  if (!client || client.status !== 'ready') return false;

  try {
    const ttlMs = Math.floor(ttlSeconds * 1000);
    // SET lockKey token NX PX ttlMs
    const res = await client.set(key, token, 'PX', ttlMs, 'NX');
    return res === 'OK';
  } catch (err) {
    logRedisWarningThrottled(`acquireLock failed for key "${key}"`, err);
    return false; // Fail-open
  }
}

/**
 * Releases a distributed lock using Lua script to verify token match before deletion.
 *
 * @param {string} key
 * @param {string} token
 * @returns {Promise<boolean>} true if lock was deleted by owner, false otherwise
 */
async function releaseLock(key, token) {
  if (!isRedisEnabled()) return false;

  const client = getRedisClient();
  if (!client || client.status !== 'ready') return false;

  const releaseLua = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  try {
    const redisKey = resolveLuaKey(client, key);
    const result = await client.eval(releaseLua, 1, redisKey, token);
    return result === 1;
  } catch (err) {
    logRedisWarningThrottled(`releaseLock failed for key "${key}"`, err);
    return false;
  }
}

module.exports = {
  isReady,
  getJSON,
  setJSON,
  del,
  incr,
  acquireLock,
  releaseLock
};

