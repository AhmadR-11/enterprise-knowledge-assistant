// backend/src/services/retrieval.service.js
const crypto = require('crypto');
const genAI = require('../config/gemini');
const chunkModel = require('../models/postgres/documentChunk.model');
const spaceModel = require('../models/postgres/space.model');
const Document = require('../models/mongo/Document.model');
const cacheService = require('./cache.service');
const {
  isRetrievalCacheEnabled,
  getCorpusVersion,
  computeRetrievalKey,
  getCachedCandidates,
  setCachedCandidates
} = require('./retrievalCache.service');

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_CACHE_TTL_SEC = 24 * 60 * 60; // 24 hours

/**
 * Normalizes query string: trim, lowercase, and collapse multiple whitespace characters.
 * @param {string} text
 * @returns {string}
 */
function normalizeQuery(text) {
  return (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Calculates cache key for a normalized query and model.
 * Format: emb:<sha256(model + normalizedQuery)>
 * @param {string} normalizedQuery
 * @param {string} model
 * @returns {string}
 */
function getEmbeddingCacheKey(normalizedQuery, model = EMBEDDING_MODEL) {
  const hash = crypto.createHash('sha256').update(`${model}:${normalizedQuery}`).digest('hex');
  return `emb:${hash}`;
}

/**
 * Retrieves query embedding from Redis cache or computes via Gemini and caches it.
 * Fail-open: if Redis is disabled or fails, seamlessly generates live embedding.
 *
 * @param {string} queryText
 * @returns {Promise<number[]>}
 */
async function getOrGenerateQueryEmbedding(queryText) {
  const normalized = normalizeQuery(queryText);
  const cacheKey = getEmbeddingCacheKey(normalized, EMBEDDING_MODEL);

  // 1. Attempt cache lookup
  if (cacheService.isReady()) {
    try {
      const cached = await cacheService.getJSON(cacheKey);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        console.debug(`[EmbeddingCache] HIT: "${normalized.slice(0, 40)}" -> ${cacheKey}`);
        return cached;
      }
    } catch (err) {
      // Fail-open: continue to live generation
    }
    console.debug(`[EmbeddingCache] MISS: "${normalized.slice(0, 40)}" -> ${cacheKey}`);
  }

  // 2. Generate embedding using Gemini gemini-embedding-001 (768-dim)
  const embeddingModel = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const res = await embeddingModel.embedContent({
    content: { parts: [{ text: queryText }] },
    outputDimensionality: 768
  });
  const queryEmbedding = res.embedding.values;

  // 3. Cache only query embeddings with 24h TTL (fail-open)
  try {
    await cacheService.setJSON(cacheKey, queryEmbedding, EMBEDDING_CACHE_TTL_SEC);
  } catch (err) {
    // Fail-open
  }

  return queryEmbedding;
}

const retrieveContext = async (queryText, spaceIds = null, topK = 5, documentIds = null) => {
  // If spaceIds is an empty array, the user has 0 accessible spaces
  if (Array.isArray(spaceIds) && spaceIds.length === 0) {
    return { contextText: '', chunks: [], sources: [] };
  }

  const cleanQuery = (queryText || '').trim();
  const shouldAttemptCache =
    cleanQuery.length >= 2 &&
    isRetrievalCacheEnabled() &&
    (!documentIds || documentIds.length === 0);

  let corpusVersion = null;
  let cacheKey = null;
  let effectiveSpaceIds = null;

  if (shouldAttemptCache) {
    corpusVersion = await getCorpusVersion();
    if (corpusVersion !== null) {
      if (Array.isArray(spaceIds)) {
        effectiveSpaceIds = [...new Set(spaceIds.map(Number))].sort((a, b) => a - b);
      } else {
        const allSpaces = await spaceModel.listAllSpaces();
        effectiveSpaceIds = (allSpaces || []).map((s) => Number(s.id)).sort((a, b) => a - b);
      }

      const normalizedQuery = normalizeQuery(cleanQuery);
      cacheKey = computeRetrievalKey({
        corpusVersion,
        embeddingModel: EMBEDDING_MODEL,
        normalizedQuery,
        topK,
        sortedSpaceIds: effectiveSpaceIds
      });
    }
  }

  // 1. If cache candidate check is possible, attempt lookup
  if (cacheKey) {
    const cachedCandidates = await getCachedCandidates(cacheKey);
    if (cachedCandidates && cachedCandidates.length > 0) {
      const candidateChunkIds = cachedCandidates.map((c) => Number(c.chunkId));

      // Hydrate from PostgreSQL with space access filter
      const pgChunks = await chunkModel.getChunksByIds(candidateChunkIds, effectiveSpaceIds);
      const pgChunkMap = new Map();
      for (const row of pgChunks) {
        pgChunkMap.set(Number(row.id), row);
      }

      // Verify document existence in Mongo (AND document not deleted)
      const docIds = [...new Set(pgChunks.map((c) => c.document_id))];
      const docs = await Document.find({ _id: { $in: docIds } }).lean();
      const docMap = new Map();
      for (const d of docs) {
        docMap.set(String(d._id), d);
      }

      const candidateScoreMap = new Map();
      for (const cand of cachedCandidates) {
        candidateScoreMap.set(Number(cand.chunkId), Number(cand.score));
      }

      // Preserve original candidate order and drop unauthorized/deleted chunks
      const survivingChunks = [];
      let droppedCount = 0;

      for (const cand of cachedCandidates) {
        const chunk = pgChunkMap.get(Number(cand.chunkId));
        if (!chunk) {
          droppedCount++;
          continue;
        }
        const doc = docMap.get(String(chunk.document_id));
        if (!doc) {
          droppedCount++;
          continue;
        }
        survivingChunks.push({
          id: chunk.id,
          documentId: chunk.document_id,
          documentTitle: doc.title || doc.originalName || 'Document',
          originalName: doc.originalName || doc.title || 'Document',
          spaceId: chunk.space_id,
          content: chunk.content,
          pageNumber: chunk.page_number,
          similarity: candidateScoreMap.get(Number(cand.chunkId)) || 0
        });
      }

      // Threshold check: if fewer than topK / 2 survive (or fewer than original candidates if total < topK/2), treat as MISS
      const minThreshold = Math.min(cachedCandidates.length, Math.ceil(topK / 2));
      if (survivingChunks.length >= minThreshold) {
        console.debug(`[RetrievalCache] HIT: key=${cacheKey}, returned=${survivingChunks.length}, dropped=${droppedCount}`);

        const contextText = survivingChunks
          .map((c) => `[Source: ${c.documentTitle} | Page ${c.pageNumber}]\n${c.content}`)
          .join('\n\n');

        return {
          contextText,
          chunks: survivingChunks,
          sources: survivingChunks.map((c) => ({
            documentId: c.documentId,
            documentTitle: c.documentTitle,
            title: c.documentTitle,
            originalName: c.originalName,
            pageNumber: c.pageNumber,
            similarity: Math.round(c.similarity * 100) / 100
          }))
        };
      } else {
        console.debug(
          `[RetrievalCache] HYDRATE DROP THRESHOLD: ${survivingChunks.length} < ${minThreshold} (dropped=${droppedCount}), treating as MISS`
        );
      }
    } else {
      console.debug(`[RetrievalCache] MISS: key=${cacheKey}`);
    }
  }

  // 2. Cache MISS or bypassed: generate or retrieve query embedding
  const queryEmbedding = await getOrGenerateQueryEmbedding(queryText);

  // Search pgvector for most relevant chunks
  const chunks = await chunkModel.searchChunksByVector(queryEmbedding, spaceIds, topK, documentIds);

  if (!chunks || chunks.length === 0) {
    return { contextText: '', chunks: [], sources: [] };
  }

  // Fetch document metadata for citations
  const docIds = [...new Set(chunks.map((c) => c.document_id))];
  const docs = await Document.find({ _id: { $in: docIds } }).lean();
  const docMap = new Map();
  docs.forEach((d) => docMap.set(String(d._id), d));

  const enrichedChunks = chunks.map((c) => {
    const doc = docMap.get(String(c.document_id));
    return {
      id: c.id,
      documentId: c.document_id,
      documentTitle: doc?.title || doc?.originalName || 'Document',
      originalName: doc?.originalName || doc?.title || 'Document',
      spaceId: c.space_id,
      content: c.content,
      pageNumber: c.page_number,
      similarity: c.similarity
    };
  });

  // 3. Cache candidates if eligible (never cache empty results or short queries)
  if (cacheKey && enrichedChunks.length > 0) {
    const candidates = enrichedChunks.map((c) => ({
      chunkId: c.id,
      score: c.similarity
    }));
    await setCachedCandidates(cacheKey, candidates);
  }

  const contextText = enrichedChunks
    .map((c) => `[Source: ${c.documentTitle} | Page ${c.pageNumber}]\n${c.content}`)
    .join('\n\n');

  return {
    contextText,
    chunks: enrichedChunks,
    sources: enrichedChunks.map((c) => ({
      documentId: c.documentId,
      documentTitle: c.documentTitle,
      title: c.documentTitle,
      originalName: c.originalName,
      pageNumber: c.pageNumber,
      similarity: Math.round(c.similarity * 100) / 100
    }))
  };
};

module.exports = {
  retrieveContext,
  getOrGenerateQueryEmbedding,
  normalizeQuery,
  getEmbeddingCacheKey,
  EMBEDDING_MODEL,
  EMBEDDING_CACHE_TTL_SEC
};
