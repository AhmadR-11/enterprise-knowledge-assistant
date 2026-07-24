// backend/src/routes/audit.routes.js
const express = require('express');
const { getLogs, getStats } = require('../controllers/audit.controller');
const protect = require('../middleware/auth.middleware');
const requireRoles = require('../middleware/role.middleware');

const router = express.Router();

// GET /api/audit — filterable by email, action, startDate, endDate (Admin only)
router.get('/', protect, requireRoles('admin'), getLogs);

// GET /api/stats — system-wide usage stats (all authenticated users)
router.get('/stats', protect, getStats);

module.exports = router;
