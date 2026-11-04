// backend/src/routes/document.routes.js
const express = require('express');
const {
  uploadMiddleware,
  uploadDocument,
  listDocuments,
  updateDocumentMetadata,
  deleteDocument,
  handleReprocess,
  getDocumentSummary
} = require('../controllers/document.controller');
const protect = require('../middleware/auth.middleware');
const requireRoles = require('../middleware/role.middleware');
const { uploadRateLimiter } = require('../middleware/rateLimiter.middleware');

const router = express.Router();

// Upload a document (Admin to any space; Editor to their assigned space — FR-2.1)
router.post('/',
  protect,
  requireRoles('admin', 'editor'),
  uploadRateLimiter,
  uploadMiddleware,
  uploadDocument
);

// List documents (space-scoped for non-admins — FR-2.2 & FR-2.6)
router.get('/', protect, listDocuments);

// Document summary/details for RAG citations (space-scoped RBAC)
router.get('/:id/summary', protect, getDocumentSummary);

// Edit document metadata (title, tags, description — FR-2.3)
router.patch('/:id',
  protect,
  requireRoles('admin', 'editor'),
  updateDocumentMetadata
);

// Delete a document (personally uploaded docs only for Editors — FR-2.4)
router.delete('/:id',
  protect,
  requireRoles('admin', 'editor'),
  deleteDocument
);

// Re-process / re-embed a document — Admin only (FR-1.7)
router.post('/:id/reprocess',
  protect,
  requireRoles('admin'),
  handleReprocess
);

module.exports = router;
