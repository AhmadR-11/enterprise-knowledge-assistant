// backend/src/tools/getDocumentDetails.tool.js
const { z } = require('zod');
const mongoose = require('mongoose');
const Document = require('../models/mongo/Document.model');
const userSpaceModel = require('../models/postgres/userSpace.model');
const spaceModel = require('../models/postgres/space.model');
const pool = require('../config/db.postgres');

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
 * @param {z.infer<typeof getDocumentDetailsSchema>} args
 * @param {Object} userContext
 * @param {Object} userContext.user - Authenticated user from req.user
 * @param {number[]|null} [userContext.targetSpaceIds]
 * @returns {Promise<Object>}
 */
const executeGetDocumentDetails = async (args, userContext) => {
  const { documentId } = args;

  // Validate ObjectId format
  if (!mongoose.Types.ObjectId.isValid(documentId)) {
    return {
      error: 'NOT_FOUND',
      message: 'Document not found or access denied'
    };
  }

  const doc = await Document.findById(documentId).lean();
  if (!doc) {
    return {
      error: 'NOT_FOUND',
      message: 'Document not found or access denied'
    };
  }

  // RBAC Access Control Enforcement
  const currentUser = userContext?.user;
  if (!currentUser) {
    return {
      error: 'UNAUTHORIZED',
      message: 'Authentication required'
    };
  }

  if (currentUser.role !== 'admin') {
    const userSpaces = await userSpaceModel.listSpacesForUser(currentUser.id);
    if (!userSpaces || !userSpaces.includes(doc.spaceId)) {
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

  // Retrieve space details and first chunk preview
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

  return {
    success: true,
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
};

module.exports = {
  name: 'getDocumentDetails',
  schema: getDocumentDetailsSchema,
  declaration: getDocumentDetailsDeclaration,
  execute: executeGetDocumentDetails
};

