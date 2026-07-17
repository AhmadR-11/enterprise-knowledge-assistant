// backend/src/routes/auth.routes.js
const express = require('express');
const { register, login } = require('../controllers/auth.controller');
const router = express.Router();

// Public routes for user registration and login
router.post('/register', register);
router.post('/login', login);

module.exports = router;
