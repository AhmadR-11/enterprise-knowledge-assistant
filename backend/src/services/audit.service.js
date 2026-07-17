// backend/src/services/audit.service.js
const AuditLog = require('../models/mongo/AuditLog.model');

/**
 * Log an authentication or system action to MongoDB audit logs
 * @param {string} action - Action name (e.g. 'AUTH_LOGIN_SUCCESS', 'AUTH_LOGIN_FAILURE')
 * @param {string} email - Target email
 * @param {Object} req - Express request object for IP and user-agent
 * @param {Object} [details] - Extra metadata details
 */
const logAuthAttempt = async (action, email, req, details = {}) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    await AuditLog.create({
      action,
      email: email.toLowerCase(),
      ip,
      userAgent,
      details
    });
  } catch (error) {
    console.error('Failed to write audit log to MongoDB:', error.message);
  }
};

module.exports = {
  logAuthAttempt
};
