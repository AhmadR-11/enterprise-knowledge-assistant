// backend/src/controllers/audit.controller.js
const AuditLog = require('../models/mongo/AuditLog.model');
const Document = require('../models/mongo/Document.model');
const pool = require('../config/db.postgres');
const { listSpacesForUser } = require('../models/postgres/userSpace.model');
const { successResponse } = require('../utils/apiResponse');

// GET /api/audit — Admin only, with optional filters
const getLogs = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const page  = parseInt(req.query.page,  10) || 1;
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.email)     filter.email  = { $regex: req.query.email, $options: 'i' };
    if (req.query.action)    filter.action = req.query.action;
    if (req.query.startDate || req.query.endDate) {
      filter.timestamp = {};
      if (req.query.startDate) filter.timestamp.$gte = new Date(req.query.startDate);
      if (req.query.endDate)   filter.timestamp.$lte = new Date(req.query.endDate);
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments(filter)
    ]);

    return successResponse(res, 'Audit logs retrieved successfully', {
      logs,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (err) { return next(err); }
};

// GET /api/stats — Admin gets system-wide stats; Editors/Viewers get stats for their assigned space(s)
const getStats = async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    let docFilter = {};
    let auditFilter = {};

    if (req.user.role !== 'admin') {
      const userSpaceIds = await listSpacesForUser(req.user.id);
      docFilter = { spaceId: { $in: userSpaceIds } };
      auditFilter = { email: req.user.email };
    }

    const [
      totalDocuments,
      totalQueries,
      activeUsersResult,
      docsByStatus,
      recentLogs
    ] = await Promise.all([
      Document.countDocuments(docFilter),
      AuditLog.countDocuments({ ...auditFilter, action: 'CHAT_QUERY' }),
      AuditLog.distinct('email', { ...auditFilter, timestamp: { $gte: thirtyDaysAgo } }),
      Document.aggregate([
        { $match: docFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      AuditLog.find(auditFilter).sort({ timestamp: -1 }).limit(5)
    ]);

    // docs grouped by space
    const docsBySpace = await Document.aggregate([
      { $match: docFilter },
      { $group: { _id: '$spaceId', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const statusMap = {};
    docsByStatus.forEach((s) => { statusMap[s._id] = s.count; });

    let activeUsersCount = activeUsersResult.length;
    if (req.user.role === 'admin' && activeUsersResult.length > 0) {
      const { rows } = await pool.query(
        `SELECT COUNT(DISTINCT email) as count FROM users WHERE email = ANY($1)`,
        [activeUsersResult]
      );
      activeUsersCount = parseInt(rows[0].count, 10);
    }

    return successResponse(res, 'Stats retrieved successfully', {
      totalDocuments,
      totalQueries,
      activeUsers: activeUsersCount,
      documentsByStatus: statusMap,
      documentsBySpace: docsBySpace,
      recentActivity: recentLogs
    });
  } catch (err) { return next(err); }
};

module.exports = { getLogs, getStats };
