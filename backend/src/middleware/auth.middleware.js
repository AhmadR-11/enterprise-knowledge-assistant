// backend/src/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const { findUserById } = require('../models/postgres/user.model');
const { errorResponse } = require('../utils/apiResponse');

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Fetch user from PostgreSQL to ensure they still exist and check latest role
      const user = await findUserById(decoded.id);
      if (!user) {
        return errorResponse(res, 'Not authorized, user not found', 401);
      }

      // Attach user details to request object
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role // 'admin', 'editor', 'viewer'
      };

      return next();
    } catch (error) {
      console.error('JWT Verification Error:', error);
      return errorResponse(res, 'Not authorized, token failed', 401);
    }
  }

  if (!token) {
    return errorResponse(res, 'Not authorized, no token provided', 401);
  }
};

module.exports = protect;
