// backend/src/routes/space.routes.js
const express = require('express');
const {
  createSpace, renameSpace, deleteSpace,
  assignUserToSpace, removeUserFromSpace,
  getUserSpaces, getUsersInSpace
} = require('../controllers/space.controller');
const protect = require('../middleware/auth.middleware');
const requireRoles = require('../middleware/role.middleware');
const checkSpaceAccess = require('../middleware/spaceAccess.middleware');

const router = express.Router();

router.post('/',              protect, requireRoles('admin'), createSpace);
router.patch('/:id',          protect, requireRoles('admin'), renameSpace);
router.delete('/:id',         protect, requireRoles('admin'), deleteSpace);
router.post('/assign',        protect, requireRoles('admin'), assignUserToSpace);
router.delete('/assign',      protect, requireRoles('admin'), removeUserFromSpace);
router.get('/my',             protect, getUserSpaces);
router.get('/:spaceId/users', protect, checkSpaceAccess, getUsersInSpace);

module.exports = router;
