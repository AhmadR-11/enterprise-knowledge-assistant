// backend/src/controllers/document.controller.js
const crypto = require('crypto');
const multer = require('multer');
const Document = require('../models/mongo/Document.model');
const { deleteChunksByDocumentId } = require('../models/postgres/documentChunk.model');
const { findSpaceById } = require('../models/postgres/space.model');
const { checkSpaceMembership, listSpacesForUser } = require('../models/postgres/userSpace.model');
const { ingestDocument, reprocessDocument } = require('../services/ingestion.service');
const { execute: executeGetDocumentDetails, invalidateDocumentMetadata } = require('../tools/getDocumentDetails.tool');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const cacheService = require('../services/cache.service');
const { incrementCorpusVersion } = require('../services/retrievalCache.service');

const INGESTION_LOCK_TTL_SEC = 600; // 10 minutes lock TTL

// Multer: memory storage, 20MB limit, allowed types
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/markdown'
    ];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only PDF, DOCX, and TXT files are allowed'));
  }
});

// Export multer middleware for route use
const uploadMiddleware = upload.single('file');

// POST /api/documents (FR-2.1: Editor can upload ONLY into space(s) they belong to)
const uploadDocument = async (req, res, next) => {
  if (!req.file) return errorResponse(res, 'No file uploaded', 400);
  const spaceId = parseInt(req.body.spaceId, 10);
  if (isNaN(spaceId)) return errorResponse(res, 'spaceId is required', 400);

  try {
    const space = await findSpaceById(spaceId);
    if (!space) return errorResponse(res, 'Space not found', 404);

    // Access check: admin can upload to any space; editor must be a space member
    if (req.user.role !== 'admin') {
      const isMember = await checkSpaceMembership(req.user.id, spaceId);
      if (!isMember) {
        return errorResponse(res, 'Access Denied: You can only upload documents into your assigned space(s)', 403);
      }
      if (req.user.role === 'viewer') {
        return errorResponse(res, 'Viewers cannot upload documents', 403);
      }
    }

    // Ingestion Distributed Lock (R8): prevent concurrent duplicate ingestion
    const contentHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const lockKey = `lock:ingest:${spaceId}:${contentHash}`;
    const lockToken = crypto.randomUUID();
    let lockAcquired = false;

    if (cacheService.isReady()) {
      lockAcquired = await cacheService.acquireLock(lockKey, lockToken, INGESTION_LOCK_TTL_SEC);
      if (!lockAcquired) {
        return errorResponse(
          res,
          'This document is already being processed. Please wait for the current upload to complete.',
          409
        );
      }
    }

    try {
      // Run ingestion pipeline
      const doc = await ingestDocument(req.file, spaceId, req.user.id);
      await invalidateDocumentMetadata(doc._id);
      await incrementCorpusVersion();
      return successResponse(res, 'Document uploaded and processed successfully', doc, 201);
    } finally {
      if (lockAcquired) {
        await cacheService.releaseLock(lockKey, lockToken);
      }
    }
  } catch (err) { return next(err); }
};

// GET /api/documents?spaceId= (FR-2.2 & FR-2.6: Editor lists docs within their space(s) with upload status)
const listDocuments = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.spaceId) {
      filter.spaceId = parseInt(req.query.spaceId, 10);
    }

    if (req.user.role !== 'admin') {
      // Non-admins (editors/viewers) can only view documents in their assigned space(s)
      const userSpaceIds = await listSpacesForUser(req.user.id);
      
      if (filter.spaceId) {
        if (!userSpaceIds.includes(filter.spaceId)) {
          return errorResponse(res, 'Access Denied: You do not have access to this space', 403);
        }
      } else {
        // Automatically scope documents to user's assigned spaces
        filter.spaceId = { $in: userSpaceIds };
      }
    }

    const docs = await Document.find(filter).sort({ createdAt: -1 });
    return successResponse(res, 'Documents retrieved successfully', { documents: docs });
  } catch (err) { return next(err); }
};

// PATCH /api/documents/:id (FR-2.3: Editor can edit document metadata for docs they uploaded)
const updateDocumentMetadata = async (req, res, next) => {
  const { id } = req.params;
  const { title, description, tags } = req.body;

  try {
    const doc = await Document.findById(id);
    if (!doc) return errorResponse(res, 'Document not found', 404);

    // Access check: Editors can only edit metadata for documents they personally uploaded
    if (req.user.role !== 'admin') {
      if (doc.uploadedBy !== req.user.id) {
        return errorResponse(res, 'Access Denied: You can only edit metadata for documents you personally uploaded', 403);
      }
    }

    if (title !== undefined) doc.title = title.trim();
    if (description !== undefined) doc.description = description.trim();
    if (tags !== undefined) {
      doc.tags = Array.isArray(tags) 
        ? tags.map(t => String(t).trim()).filter(Boolean)
        : String(tags).split(',').map(t => t.trim()).filter(Boolean);
    }

    await doc.save();
    await invalidateDocumentMetadata(id);
    await incrementCorpusVersion();
    return successResponse(res, 'Document metadata updated successfully', doc);
  } catch (err) { return next(err); }
};

// DELETE /api/documents/:id (FR-2.4: Editor can delete documents they personally uploaded)
const deleteDocument = async (req, res, next) => {
  const { id } = req.params;
  try {
    const doc = await Document.findById(id);
    if (!doc) return errorResponse(res, 'Document not found', 404);

    // Access check: Editors can ONLY delete documents they personally uploaded
    if (req.user.role !== 'admin') {
      if (doc.uploadedBy !== req.user.id) {
        return errorResponse(res, 'Access Denied: You can only delete documents you personally uploaded', 403);
      }
    }

    // Delete chunks from Neon then metadata from Mongo
    await deleteChunksByDocumentId(id);
    await Document.findByIdAndDelete(id);
    await invalidateDocumentMetadata(id);
    await incrementCorpusVersion();
    return successResponse(res, 'Document deleted successfully', { id });
  } catch (err) { return next(err); }
};

// POST /api/documents/:id/reprocess
const handleReprocess = async (req, res, next) => {
  const { id } = req.params;
  try {
    const doc = await Document.findById(id);
    if (!doc) return errorResponse(res, 'Document not found', 404);

    // Access check: editor must be a member of the space
    if (req.user.role !== 'admin') {
      const isMember = await checkSpaceMembership(req.user.id, doc.spaceId);
      if (!isMember) {
        return errorResponse(res, 'Access Denied: You cannot reprocess documents outside your assigned space(s)', 403);
      }
      if (req.user.role === 'viewer') {
        return errorResponse(res, 'Viewers cannot reprocess documents', 403);
      }
    }

    await reprocessDocument(id);
    await invalidateDocumentMetadata(id);
    await incrementCorpusVersion();
    const updated = await Document.findById(id);
    return successResponse(res, 'Document reprocessing complete', updated);
  } catch (err) { return next(err); }
};

// GET /api/documents/:id/summary — Authenticated, space-scoped RBAC via executeGetDocumentDetails
const getDocumentSummary = async (req, res, next) => {
  const documentId = req.params.id;
  try {
    const result = await executeGetDocumentDetails({ documentId }, { user: req.user });
    if (result.error) {
      const statusCode = result.error === 'UNAUTHORIZED' ? 401 : 404;
      return errorResponse(res, result.message, statusCode);
    }
    return successResponse(res, 'Document details retrieved successfully', result);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  uploadMiddleware,
  uploadDocument,
  listDocuments,
  updateDocumentMetadata,
  deleteDocument,
  handleReprocess,
  getDocumentSummary
};
