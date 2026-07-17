// backend/src/controllers/auth.controller.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createUser, findUserByEmail } = require('../models/postgres/user.model');
const { logAuthAttempt } = require('../services/audit.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');

/**
 * Register a new user
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return errorResponse(res, 'Email, password, and role are required', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedRole = role.trim().toLowerCase();

  // Validate role based on check constraint in Neon DB schema
  if (!['admin', 'editor', 'viewer'].includes(normalizedRole)) {
    return errorResponse(res, 'Invalid role. Role must be admin, editor, or viewer', 400);
  }

  // Validate password length
  if (password.length < 6) {
    return errorResponse(res, 'Password must be at least 6 characters long', 400);
  }

  try {
    // Check if email already registered
    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      await logAuthAttempt('AUTH_REGISTER_FAILURE', normalizedEmail, req, { reason: 'Email already exists' });
      return errorResponse(res, 'Email already registered', 400);
    }

    // Hash password using bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Save to PostgreSQL users table
    const newUser = await createUser(normalizedEmail, passwordHash, normalizedRole);

    // Generate JWT token
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log registration success
    await logAuthAttempt('AUTH_REGISTER_SUCCESS', normalizedEmail, req, {
      userId: newUser.id,
      role: newUser.role
    });

    return successResponse(
      res,
      'User registered successfully',
      {
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          role: newUser.role
        }
      },
      201
    );
  } catch (error) {
    console.error('Registration controller error:', error);
    await logAuthAttempt('AUTH_REGISTER_FAILURE', normalizedEmail, req, {
      reason: 'Server error during registration',
      error: error.message
    });
    return next(error);
  }
};

/**
 * User login
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return errorResponse(res, 'Email and password are required', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Find user in PostgreSQL
    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      // Log login failure
      await logAuthAttempt('AUTH_LOGIN_FAILURE', normalizedEmail, req, { reason: 'User email not found' });
      return errorResponse(res, 'Invalid email or password', 401);
    }

    // Compare bcrypt hashes
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      // Log login failure
      await logAuthAttempt('AUTH_LOGIN_FAILURE', normalizedEmail, req, {
        reason: 'Password mismatch',
        userId: user.id
      });
      return errorResponse(res, 'Invalid email or password', 401);
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log login success
    await logAuthAttempt('AUTH_LOGIN_SUCCESS', normalizedEmail, req, {
      userId: user.id,
      role: user.role
    });

    return successResponse(res, 'Login successful', {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login controller error:', error);
    await logAuthAttempt('AUTH_LOGIN_FAILURE', normalizedEmail, req, {
      reason: 'Server error during login',
      error: error.message
    });
    return next(error);
  }
};

module.exports = {
  register,
  login
};
