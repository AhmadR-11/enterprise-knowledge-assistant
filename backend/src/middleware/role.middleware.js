// backend/src/middleware/role.middleware.js
const { errorResponse } = require('../utils/apiResponse');

/**
 * Middleware to restrict access to specific roles
 * @param {...string} allowedRoles - Allowed roles ('admin', 'editor', 'viewer')
 */
const requireRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'Not authenticated', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return errorResponse(
        res,
        `Forbidden: Role '${req.user.role}' lacks permission for this action`,
        403
      );
    }

    return next();
  };
};

module.exports = requireRoles;
