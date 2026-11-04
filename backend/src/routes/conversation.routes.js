// backend/src/routes/conversation.routes.js
const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const conversationController = require('../controllers/conversation.controller');

// All conversation routes require authenticated user
router.use(protect);

router.get('/', conversationController.getConversations);
router.get('/:id/messages', conversationController.getConversationMessages);
router.patch('/:id', conversationController.renameConversation);
router.delete('/:id', conversationController.deleteConversation);

module.exports = router;

