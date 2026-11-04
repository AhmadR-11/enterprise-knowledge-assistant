// backend/src/routes/auth.routes.js
const express = require('express');
const { register, login, logout } = require('../controllers/auth.controller');
const { authRateLimiter } = require('../middleware/rateLimiter.middleware');
const protect = require('../middleware/auth.middleware');
const router = express.Router();

// Public routes for user registration and login (protected by rate limiting: 10 per 15 min per IP)
router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);

// Authenticated route for user logout (revokes token JTI in Redis denylist)
router.post('/logout', protect, logout);

module.exports = router;
