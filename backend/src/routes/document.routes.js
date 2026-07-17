// backend/src/routes/document.routes.js
const express = require('express');
const { uploadMiddleware, uploadDocument, listDocuments, deleteDocument, handleReprocess } = require('../controllers/document.controller');
const protect = require('../middleware/auth.middleware');
const requireRoles = require('../middleware/role.middleware');

const router = express.Router();

// Upload a document (Admin to any space; Editor to their own space)
router.post('/',
  protect,
  requireRoles('admin', 'editor'),
  uploadMiddleware,
  uploadDocument
);

// List documents (spaceId query param required for non-admins)
router.get('/', protect, listDocuments);

// Delete a document
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
