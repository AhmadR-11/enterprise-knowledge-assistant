// backend/src/controllers/document.controller.js
const multer = require('multer');
const Document = require('../models/mongo/Document.model');
const { deleteChunksByDocumentId } = require('../models/postgres/documentChunk.model');
const { findSpaceById } = require('../models/postgres/space.model');
const { checkSpaceMembership } = require('../models/postgres/userSpace.model');
const { ingestDocument, reprocessDocument } = require('../services/ingestion.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');

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

// POST /api/documents
const uploadDocument = async (req, res, next) => {
  if (!req.file) return errorResponse(res, 'No file uploaded', 400);
  const spaceId = parseInt(req.body.spaceId, 10);
  if (isNaN(spaceId)) return errorResponse(res, 'spaceId is required', 400);

  try {
    const space = await findSpaceById(spaceId);
    if (!space) return errorResponse(res, 'Space not found', 404);

    // Access check: admin can upload to any space; editor must be a member
    if (req.user.role !== 'admin') {
      const isMember = await checkSpaceMembership(req.user.id, spaceId);
      if (!isMember) return errorResponse(res, 'Access Denied: not a member of this space', 403);
      if (req.user.role === 'viewer') return errorResponse(res, 'Viewers cannot upload documents', 403);
    }

    // Run ingestion pipeline (async-friendly but awaited here for status)
    const doc = await ingestDocument(req.file, spaceId, req.user.id);
    return successResponse(res, 'Document uploaded and processed successfully', doc, 201);
  } catch (err) { return next(err); }
};

// GET /api/documents?spaceId=
const listDocuments = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.spaceId) filter.spaceId = parseInt(req.query.spaceId, 10);
    if (req.user.role !== 'admin') {
      // Non-admins can only see docs in their own spaces
      // spaceId must be provided and they must be a member
      if (!req.query.spaceId) return errorResponse(res, 'spaceId query param is required', 400);
      const isMember = await checkSpaceMembership(req.user.id, filter.spaceId);
      if (!isMember) return errorResponse(res, 'Access Denied', 403);
    }
    const docs = await Document.find(filter).sort({ createdAt: -1 });
    return successResponse(res, 'Documents retrieved successfully', { documents: docs });
  } catch (err) { return next(err); }
};

// DELETE /api/documents/:id
const deleteDocument = async (req, res, next) => {
  const { id } = req.params;
  try {
    const doc = await Document.findById(id);
    if (!doc) return errorResponse(res, 'Document not found', 404);

    // Access check
    if (req.user.role !== 'admin') {
      const isMember = await checkSpaceMembership(req.user.id, doc.spaceId);
      if (!isMember) return errorResponse(res, 'Access Denied', 403);
      if (req.user.role === 'viewer') return errorResponse(res, 'Viewers cannot delete documents', 403);
    }

    // Delete chunks from Neon then metadata from Mongo
    await deleteChunksByDocumentId(id);
    await Document.findByIdAndDelete(id);
    return successResponse(res, 'Document deleted successfully', { id });
  } catch (err) { return next(err); }
};

// POST /api/documents/:id/reprocess — Admin only
const handleReprocess = async (req, res, next) => {
  const { id } = req.params;
  try {
    const doc = await Document.findById(id);
    if (!doc) return errorResponse(res, 'Document not found', 404);
    await reprocessDocument(id);
    const updated = await Document.findById(id);
    return successResponse(res, 'Document reprocessing complete', updated);
  } catch (err) { return next(err); }
};

module.exports = { uploadMiddleware, uploadDocument, listDocuments, deleteDocument, handleReprocess };
