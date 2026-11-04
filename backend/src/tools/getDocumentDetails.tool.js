// backend/src/tools/getDocumentDetails.tool.js
const { z } = require('zod');
const mongoose = require('mongoose');
const Document = require('../models/mongo/Document.model');
const spaceModel = require('../models/postgres/space.model');
const pool = require('../config/db.postgres');
const cacheService = require('../services/cache.service');
const { getUserAccess } = require('../services/accessControl.service');

const DOC_META_TTL_SEC = 300; // 300 seconds (5 minutes) TTL

/**
 * Invalidates cached metadata for a specific document ID.
 * @param {string} documentId
 * @returns {Promise<void>}
 */
const invalidateDocumentMetadata = async (documentId) => {
  if (!documentId) return;
  const docIdStr = String(documentId);
  const cacheKey = `docmeta:${docIdStr}`;
  console.debug(`[DocMetaCache] Invalidate metadata for document ${docIdStr}`);
  try {
    await cacheService.del(cacheKey);
  } catch (err) {
    console.warn(`[DocMetaCache] Failed to delete cache for document ${docIdStr}:`, err.message);
  }
};

/**
 * Zod schema for getDocumentDetails tool arguments.
 */
const getDocumentDetailsSchema = z.object({
  documentId: z.string().min(1, 'documentId is required')
});

/**
 * OpenAPI-compatible Gemini function declaration.
 */
const getDocumentDetailsDeclaration = {
  name: 'getDocumentDetails',
  description: 'Retrieve detailed metadata, space information, page/chunk count, and preview snippet for a specific document by its ID. Use this when you have a document ID from search results and need deeper context or metadata.',
  parameters: {
    type: 'object',
    properties: {
      documentId: {
        type: 'string',
        description: 'The unique ID of the document to inspect.'
      }
    },
    required: ['documentId']
  }
};

/**
 * Executes document inspection with strict space-based RBAC verification.
 * ORDER OF OPERATIONS IS CRITICAL:
 * 1. Verify user's access to the document's space FIRST.
 * 2. Only if authorized, read/serve non-user-specific document metadata from cache or DB.
 * 3. Never cache access denials or errors.
 *
 * @param {z.infer<typeof getDocumentDetailsSchema>} args
 * @param {Object} userContext
 * @param {Object} userContext.user - Authenticated user from req.user
 * @param {number[]|null} [userContext.targetSpaceIds]
 * @returns {Promise<Object>}
 */
const executeGetDocumentDetails = async (args, userContext) => {
  const { documentId } = args;

  // 1. Validate ObjectId format
  if (!mongoose.Types.ObjectId.isValid(documentId)) {
    return {
      error: 'NOT_FOUND',
      message: 'Document not found or access denied'
    };
  }

  // 2. Authentication check
  const currentUser = userContext?.user;
  if (!currentUser) {
    return {
      error: 'UNAUTHORIZED',
      message: 'Authentication required'
    };
  }

  // 3. Document existence & space check in DB (never expose or cache non-existent docs)
  const doc = await Document.findById(documentId).lean();
  if (!doc) {
    return {
      error: 'NOT_FOUND',
      message: 'Document not found or access denied'
    };
  }

  // 4. CRITICAL: Enforce RBAC access check FIRST using (possibly cached) user permissions
  if (currentUser.role !== 'admin') {
    const userAccess = await getUserAccess(currentUser);
    const userSpaces = userAccess.spaceIds || [];

    if (!userSpaces.includes(doc.spaceId)) {
      // Do not reveal that the document exists in an unauthorized space
      return {
        error: 'NOT_FOUND',
        message: 'Document not found or access denied'
      };
    }

    if (userContext.targetSpaceIds && !userContext.targetSpaceIds.includes(doc.spaceId)) {
      return {
        error: 'NOT_FOUND',
        message: 'Document not found or access denied'
      };
    }
  }

  // 5. Access is confirmed. Now attempt to read metadata from cache
  const cacheKey = `docmeta:${documentId}`;
  if (cacheService.isReady()) {
    try {
      const cached = await cacheService.getJSON(cacheKey);
      if (cached && typeof cached === 'object' && cached.documentId) {
        console.debug(`[DocMetaCache] HIT: document ${documentId}`);
        return {
          success: true,
          ...cached
        };
      }
    } catch {
      // Fail-open
    }
  }

  console.debug(`[DocMetaCache] MISS: document ${documentId}`);

  // 6. On cache miss: assemble metadata from DB doc, space name, and preview snippet

  let spaceName = 'Workspace';
  try {
    const space = await spaceModel.findSpaceById(doc.spaceId);
    if (space?.name) spaceName = space.name;
  } catch {
    // Graceful fallback if space name lookup fails
  }

  let previewSnippet = '';
  try {
    const { rows } = await pool.query(
      `SELECT content FROM document_chunks WHERE document_id = $1 ORDER BY chunk_index ASC LIMIT 1`,
      [documentId]
    );
    if (rows[0]?.content) {
      previewSnippet = rows[0].content.length > 400
        ? rows[0].content.slice(0, 400).trim() + '...'
        : rows[0].content.trim();
    }
  } catch {
    // Gracefully continue without snippet preview
  }

  const metadata = {
    documentId: String(doc._id),
    title: doc.title || doc.originalName,
    originalName: doc.originalName,
    spaceId: doc.spaceId,
    spaceName,
    mimeType: doc.mimeType,
    status: doc.status,
    chunkCount: doc.chunkCount || 0,
    createdAt: doc.createdAt,
    previewSnippet
  };

  // 7. Cache only non-user-specific metadata with 300s TTL (fail-open)
  if (cacheService.isReady()) {
    try {
      await cacheService.setJSON(cacheKey, metadata, DOC_META_TTL_SEC);
    } catch {
      // Fail-open
    }
  }

  return {
    success: true,
    ...metadata
  };
};

module.exports = {
  name: 'getDocumentDetails',
  schema: getDocumentDetailsSchema,
  declaration: getDocumentDetailsDeclaration,
  execute: executeGetDocumentDetails,
  invalidateDocumentMetadata,
  DOC_META_TTL_SEC
};

