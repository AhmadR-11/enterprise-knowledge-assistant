// backend/src/controllers/space.controller.js
const {
  createSpace, findSpaceById, findSpaceByName,
  listAllSpaces, listSpacesByUserId, updateSpace, deleteSpace
} = require('../models/postgres/space.model');
const {
  assignUserToSpace, removeUserFromSpace,
  checkSpaceMembership, listUsersInSpace
} = require('../models/postgres/userSpace.model');
const { findUserById } = require('../models/postgres/user.model');
const { successResponse, errorResponse } = require('../utils/apiResponse');

// POST /api/spaces — Admin
const handleCreateSpace = async (req, res, next) => {
  const { name, description } = req.body;
  if (!name) return errorResponse(res, 'Space name is required', 400);
  try {
    const existing = await findSpaceByName(name);
    if (existing) return errorResponse(res, 'Space name already exists', 400);
    const space = await createSpace(name, description);
    return successResponse(res, 'Space created successfully', space, 201);
  } catch (err) { return next(err); }
};

// PATCH /api/spaces/:id — Admin
const handleRenameSpace = async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return errorResponse(res, 'Invalid Space ID', 400);
  const { name, description } = req.body;
  if (!name && description === undefined) return errorResponse(res, 'Nothing to update', 400);
  try {
    const space = await findSpaceById(id);
    if (!space) return errorResponse(res, 'Space not found', 404);
    if (name && name !== space.name) {
      const conflict = await findSpaceByName(name);
      if (conflict) return errorResponse(res, 'Space name already taken', 400);
    }
    const updated = await updateSpace(id, name, description);
    return successResponse(res, 'Space updated successfully', updated);
  } catch (err) { return next(err); }
};

// DELETE /api/spaces/:id — Admin
const handleDeleteSpace = async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return errorResponse(res, 'Invalid Space ID', 400);
  try {
    const space = await findSpaceById(id);
    if (!space) return errorResponse(res, 'Space not found', 404);
    await deleteSpace(id);
    return successResponse(res, 'Space deleted successfully', { id });
  } catch (err) { return next(err); }
};

// POST /api/spaces/assign — Admin
const handleAssignUserToSpace = async (req, res, next) => {
  const { userId, spaceId } = req.body;
  if (!userId || !spaceId) return errorResponse(res, 'User ID and Space ID are required', 400);
  const uId = parseInt(userId, 10);
  const sId = parseInt(spaceId, 10);
  if (isNaN(uId) || isNaN(sId)) return errorResponse(res, 'IDs must be valid integers', 400);
  try {
    const user = await findUserById(uId);
    if (!user) return errorResponse(res, 'User not found', 404);
    const space = await findSpaceById(sId);
    if (!space) return errorResponse(res, 'Space not found', 404);
    const membership = await assignUserToSpace(uId, sId);
    return successResponse(res, 'User assigned to space successfully', membership || { userId: uId, spaceId: sId });
  } catch (err) { return next(err); }
};

// DELETE /api/spaces/assign — Admin
const handleRemoveUserFromSpace = async (req, res, next) => {
  const { userId, spaceId } = req.body;
  if (!userId || !spaceId) return errorResponse(res, 'User ID and Space ID are required', 400);
  const uId = parseInt(userId, 10);
  const sId = parseInt(spaceId, 10);
  if (isNaN(uId) || isNaN(sId)) return errorResponse(res, 'IDs must be valid integers', 400);
  try {
    const removed = await removeUserFromSpace(uId, sId);
    if (!removed) return errorResponse(res, 'Membership not found', 404);
    return successResponse(res, 'User removed from space successfully', { userId: uId, spaceId: sId });
  } catch (err) { return next(err); }
};

// GET /api/spaces/my — Authenticated
const handleGetUserSpaces = async (req, res, next) => {
  try {
    const spaces = req.user.role === 'admin'
      ? await listAllSpaces()
      : await listSpacesByUserId(req.user.id);
    return successResponse(res, 'Spaces retrieved successfully', { spaces });
  } catch (err) { return next(err); }
};

// GET /api/spaces/:spaceId/users — Admin or Member
const handleGetUsersInSpace = async (req, res, next) => {
  const sId = parseInt(req.params.spaceId, 10);
  if (isNaN(sId)) return errorResponse(res, 'Invalid Space ID', 400);
  try {
    const space = await findSpaceById(sId);
    if (!space) return errorResponse(res, 'Space not found', 404);
    if (req.user.role !== 'admin') {
      const isMember = await checkSpaceMembership(req.user.id, sId);
      if (!isMember) return errorResponse(res, 'Access Denied', 403);
    }
    const users = await listUsersInSpace(sId);
    return successResponse(res, 'Users in space retrieved', { users });
  } catch (err) { return next(err); }
};

module.exports = {
  createSpace: handleCreateSpace,
  renameSpace: handleRenameSpace,
  deleteSpace: handleDeleteSpace,
  assignUserToSpace: handleAssignUserToSpace,
  removeUserFromSpace: handleRemoveUserFromSpace,
  getUserSpaces: handleGetUserSpaces,
  getUsersInSpace: handleGetUsersInSpace
};
