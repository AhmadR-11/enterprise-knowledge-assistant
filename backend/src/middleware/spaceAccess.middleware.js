// backend/src/middleware/spaceAccess.middleware.js
const { checkSpaceMembership } = require('../models/postgres/userSpace.model');
const { errorResponse } = require('../utils/apiResponse');

/**
 * Middleware to verify user has membership access to a given space
 * Admins bypass this check.
 */
const checkSpaceAccess = async (req, res, next) => {
  if (!req.user) {
    return errorResponse(res, 'Not authenticated', 401);
  }

  // Admin bypass space membership checks
  if (req.user.role === 'admin') {
    return next();
  }

  // Look for spaceId in params, body, or query
  const spaceIdStr = req.params.spaceId || req.body.spaceId || req.query.spaceId;
  
  if (!spaceIdStr) {
    return errorResponse(res, 'Space ID is required for this operation', 400);
  }

  const spaceId = parseInt(spaceIdStr, 10);
  if (isNaN(spaceId)) {
    return errorResponse(res, 'Invalid Space ID format', 400);
  }

  try {
    const isMember = await checkSpaceMembership(req.user.id, spaceId);
    if (!isMember) {
      return errorResponse(
        res,
        'Access Denied: You are not assigned to this space',
        403
      );
    }
    return next();
  } catch (error) {
    console.error('Space access check error:', error);
    return errorResponse(res, 'Error verifying space access permissions', 500);
  }
};

module.exports = checkSpaceAccess;
