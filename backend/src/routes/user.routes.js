// backend/src/routes/user.routes.js
const express = require('express');
const { listUsers, createUserByAdmin, changeUserRole, removeUser } = require('../controllers/user.controller');
const protect = require('../middleware/auth.middleware');
const requireRoles = require('../middleware/role.middleware');

const router = express.Router();

// All user management routes — Admin only
router.get('/',           protect, requireRoles('admin'), listUsers);
router.post('/',          protect, requireRoles('admin'), createUserByAdmin);
router.patch('/:id/role', protect, requireRoles('admin'), changeUserRole);
router.delete('/:id',     protect, requireRoles('admin'), removeUser);

module.exports = router;
