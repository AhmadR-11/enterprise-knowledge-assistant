// backend/src/services/retrievalCache.service.js
const crypto = require('crypto');
const cacheService = require('./cache.service');

const RETRIEVAL_CACHE_TTL_SEC = 300; // 300 seconds (5 minutes)

/**
 * Checks whether the retrieval-results cache feature flag and Redis are enabled.
 * @returns {boolean}
 */
function isRetrievalCacheEnabled() {
  return process.env.REDIS_RETRIEVAL_CACHE === 'true' && cacheService.isReady();
}

/**
 * Retrieves the global corpus version counter from Redis.
 * Strictly returns null if Redis is unavailable (does NOT guess a version).
 * @returns {Promise<number|null>}
 */
async function getCorpusVersion() {
  if (!isRetrievalCacheEnabled()) {
    return null;
  }

  try {
    const raw = await cacheService.getJSON('corpus:version');
    if (typeof raw === 'number' && raw > 0) {
      return raw;
    }
    // Initialize corpus:version to 1 if missing in Redis
    await cacheService.setJSON('corpus:version', 1, 86400 * 365);
    return 1;
  } catch (err) {
    console.warn('[RetrievalCache] Failed to read corpus:version:', err.message);
    return null;
  }
}

/**
 * Atomically increments the global corpus version in Redis.
 * Called on any document create, update, delete, re-ingest, move, or space deletion.
 * @returns {Promise<number|null>}
 */
async function incrementCorpusVersion() {
  console.debug('[RetrievalCache] Incrementing corpus:version (invalidating retrieval cache)');
  if (cacheService.isReady()) {
    try {
      const res = await cacheService.incr('corpus:version', 86400 * 365);
      return res?.count || 1;
    } catch (err) {
      console.warn('[RetrievalCache] Failed to increment corpus:version in Redis:', err.message);
    }
  }
  return null;
}

/**
 * Computes deterministic SHA-256 retrieval cache key.
 * Format: ret:<sha256(corpusVersion | embeddingModel | normalizedQuery | topK | sortedAccessibleSpaceIds)>
 *
 * @param {Object} params
 * @param {number} params.corpusVersion
 * @param {string} params.embeddingModel
 * @param {string} params.normalizedQuery
 * @param {number} params.topK
 * @param {number[]} params.sortedSpaceIds
 * @returns {string}
 */
function computeRetrievalKey({ corpusVersion, embeddingModel, normalizedQuery, topK, sortedSpaceIds }) {
  const spaceListStr = (sortedSpaceIds || []).join(',');
  const payload = `${corpusVersion}|${embeddingModel}|${normalizedQuery}|${topK}|${spaceListStr}`;
  const hash = crypto.createHash('sha256').update(payload).digest('hex');
  return `ret:${hash}`;
}

/**
 * Retrieves cached ranked candidates from Redis.
 * @param {string} cacheKey
 * @returns {Promise<Array<{ chunkId: number, score: number }>|null>}
 */
async function getCachedCandidates(cacheKey) {
  if (!isRetrievalCacheEnabled()) return null;
  try {
    const data = await cacheService.getJSON(cacheKey);
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Caches ranked candidates (ONLY chunkId and score) with 300s TTL.
 * Never stores chunk text or document contents.
 *
 * @param {string} cacheKey
 * @param {Array<{ chunkId: number, score: number }>} candidates
 * @returns {Promise<boolean>}
 */
async function setCachedCandidates(cacheKey, candidates) {
  if (!isRetrievalCacheEnabled() || !Array.isArray(candidates) || candidates.length === 0) {
    return false;
  }
  try {
    // Sanitize to strictly chunkId and score
    const sanitized = candidates.map((c) => ({
      chunkId: Number(c.chunkId || c.id),
      score: Number(c.score || c.similarity || 0)
    }));
    return await cacheService.setJSON(cacheKey, sanitized, RETRIEVAL_CACHE_TTL_SEC);
  } catch {
    return false;
  }
}

module.exports = {
  isRetrievalCacheEnabled,
  getCorpusVersion,
  incrementCorpusVersion,
  computeRetrievalKey,
  getCachedCandidates,
  setCachedCandidates,
  RETRIEVAL_CACHE_TTL_SEC
};

