// backend/src/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const userModel = require('../models/postgres/user.model');
const { errorResponse } = require('../utils/apiResponse');
const { isTokenDenied } = require('../services/tokenDenylist.service');

/**
 * Authentication Middleware.
 * Verifies JWT signature, expiration, and checks Redis token denylist.
 *
 * SECURITY TRADE-OFF (Denylist Fail-Open vs Fail-Closed):
 * - By default (AUTH_DENYLIST_FAIL_CLOSED=false), this middleware FAILS OPEN if Redis is down.
 *   This ensures application uptime and availability during cache outages. The trade-off is
 *   that a revoked/logged-out token could remain usable until its JWT `exp` timestamp elapses.
 * - When AUTH_DENYLIST_FAIL_CLOSED=true, this middleware FAILS CLOSED if Redis is down, rejecting
 *   all requests with 401. This guarantees that no revoked token can ever be accepted, but
 *   couples authentication availability directly to Redis uptime.
 */
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // 1. Verify token signature and expiration
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 2. Check token denylist in Redis if token contains jti
      // (Tokens issued prior to jti change remain valid until expiration)
      if (decoded.jti) {
        const { isDenied, error: denyError } = await isTokenDenied(decoded.jti);
        if (isDenied) {
          return errorResponse(res, denyError || 'Not authorized, token has been revoked', 401);
        }
      }

      // 3. Fetch user from PostgreSQL to ensure they still exist and check latest role
      const user = await userModel.findUserById(decoded.id);
      if (!user) {
        return errorResponse(res, 'Not authorized, user not found', 401);
      }

      // Attach user details and token payload to request object
      req.token = token;
      req.auth = decoded;
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
