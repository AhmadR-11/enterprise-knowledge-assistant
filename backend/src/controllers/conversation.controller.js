// backend/src/controllers/conversation.controller.js
const conversationService = require('../services/conversation.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');

/**
 * GET /api/conversations — Lists paginated conversations for current user.
 */
const getConversations = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await conversationService.listUserConversations(req.user.id, { page, limit });
    return successResponse(res, 'Conversations retrieved successfully', result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/conversations/:id/messages — Retrieves all messages for a conversation.
 * Returns 404 if conversation does not exist or belongs to another user.
 */
const getConversationMessages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await conversationService.getConversationMessages(id, req.user.id);
    return successResponse(res, 'Messages retrieved successfully', result);
  } catch (error) {
    if (error.status === 404) {
      return errorResponse(res, error.message, 404);
    }
    next(error);
  }
};

/**
 * PATCH /api/conversations/:id — Renames a conversation.
 * Returns 404 if conversation does not exist or belongs to another user.
 */
const renameConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const updated = await conversationService.renameConversation(id, req.user.id, title);
    return successResponse(res, 'Conversation renamed successfully', updated);
  } catch (error) {
    if (error.status === 404) {
      return errorResponse(res, error.message, 404);
    }
    if (error.status === 400) {
      return errorResponse(res, error.message, 400);
    }
    next(error);
  }
};

/**
 * DELETE /api/conversations/:id — Deletes a conversation and all its messages.
 * Returns 404 if conversation does not exist or belongs to another user.
 */
const deleteConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await conversationService.deleteConversation(id, req.user.id);
    return successResponse(res, 'Conversation deleted successfully', result);
  } catch (error) {
    if (error.status === 404) {
      return errorResponse(res, error.message, 404);
    }
    next(error);
  }
};

module.exports = {
  getConversations,
  getConversationMessages,
  renameConversation,
  deleteConversation
};

