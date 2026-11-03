// backend/src/routes/chat.routes.js
const express = require('express');
const { handleChatQuery, handleChatStream } = require('../controllers/chat.controller');
const protect = require('../middleware/auth.middleware');

const router = express.Router();

// POST /api/chat — Ask questions against space knowledge base (Synchronous)
router.post('/', protect, handleChatQuery);

// POST /api/chat/stream — Ask questions with Server-Sent Events (SSE) streaming
router.post('/stream', protect, handleChatStream);

module.exports = router;

