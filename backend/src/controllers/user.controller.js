// backend/src/controllers/user.controller.js
const bcrypt = require('bcrypt');
const { listAllUsers, findUserById, createUser, updateUserRole, deleteUser } = require('../models/postgres/user.model');
const { successResponse, errorResponse } = require('../utils/apiResponse');

// GET /api/users — Admin
const listUsers = async (req, res, next) => {
  try {
    const users = await listAllUsers();
    return successResponse(res, 'Users retrieved successfully', { users });
  } catch (err) { return next(err); }
};

// POST /api/users — Admin creates a user account
const createUserByAdmin = async (req, res, next) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role) return errorResponse(res, 'Email, password, and role are required', 400);
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedRole = role.trim().toLowerCase();
  if (!['admin', 'editor', 'viewer'].includes(normalizedRole))
    return errorResponse(res, 'Invalid role. Must be admin, editor, or viewer', 400);
  if (password.length < 6) return errorResponse(res, 'Password must be at least 6 characters', 400);
  try {
    const { findUserByEmail } = require('../models/postgres/user.model');
    const existing = await findUserByEmail(normalizedEmail);
    if (existing) return errorResponse(res, 'Email already registered', 400);
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser(normalizedEmail, passwordHash, normalizedRole);
    return successResponse(res, 'User created successfully', {
      user: { id: user.id, email: user.email, role: user.role }
    }, 201);
  } catch (err) { return next(err); }
};

// PATCH /api/users/:id/role — Admin
const changeUserRole = async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return errorResponse(res, 'Invalid user ID', 400);
  const { role } = req.body;
  if (!role) return errorResponse(res, 'Role is required', 400);
  const normalizedRole = role.trim().toLowerCase();
  if (!['admin', 'editor', 'viewer'].includes(normalizedRole))
    return errorResponse(res, 'Invalid role', 400);
  // Prevent admin from demoting themselves
  if (req.user.id === id && normalizedRole !== 'admin')
    return errorResponse(res, 'You cannot change your own role', 400);
  try {
    const user = await findUserById(id);
    if (!user) return errorResponse(res, 'User not found', 404);
    const updated = await updateUserRole(id, normalizedRole);
    return successResponse(res, 'User role updated successfully', { user: updated });
  } catch (err) { return next(err); }
};

// DELETE /api/users/:id — Admin
const removeUser = async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return errorResponse(res, 'Invalid user ID', 400);
  if (req.user.id === id) return errorResponse(res, 'You cannot delete your own account', 400);
  try {
    const user = await findUserById(id);
    if (!user) return errorResponse(res, 'User not found', 404);
    await deleteUser(id);
    return successResponse(res, 'User deleted successfully', { id });
  } catch (err) { return next(err); }
};

module.exports = { listUsers, createUserByAdmin, changeUserRole, removeUser };
