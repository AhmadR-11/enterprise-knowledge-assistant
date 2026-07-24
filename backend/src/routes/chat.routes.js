// backend/src/routes/chat.routes.js
const express = require('express');
const { handleChatQuery } = require('../controllers/chat.controller');
const protect = require('../middleware/auth.middleware');

const router = express.Router();

// POST /api/chat — Ask questions against space knowledge base (Admin, Editor, Viewer)
router.post('/', protect, handleChatQuery);

module.exports = router;
