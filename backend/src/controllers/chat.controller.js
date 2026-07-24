// backend/src/controllers/chat.controller.js
const { listSpacesForUser } = require('../models/postgres/userSpace.model');
const { retrieveContext } = require('../services/retrieval.service');
const { generateAnswer } = require('../services/llm.service');
const { logAuthAttempt } = require('../services/audit.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');

// POST /api/chat — Ask questions against indexed space knowledge base
const handleChatQuery = async (req, res, next) => {
  const { question, spaceId, documentIds } = req.body;

  if (!question || !question.trim()) {
    return errorResponse(res, 'Question is required', 400);
  }

  try {
    let targetSpaceIds = null;

    if (req.user.role !== 'admin') {
      const userSpaces = await listSpacesForUser(req.user.id);
      
      if (userSpaces.length === 0) {
        return errorResponse(res, 'Access Denied: You are not currently assigned to any space', 403);
      }

      if (spaceId) {
        const sId = parseInt(spaceId, 10);
        if (!userSpaces.includes(sId)) {
          return errorResponse(res, 'Access Denied: You do not have access to this space', 403);
        }
        targetSpaceIds = [sId];
      } else {
        targetSpaceIds = userSpaces;
      }
    } else {
      if (spaceId) {
        targetSpaceIds = [parseInt(spaceId, 10)];
      }
    }

    const docIdFilter = Array.isArray(documentIds) && documentIds.length > 0 ? documentIds : null;

    // 1. Vector Search Context Retrieval with optional document filtering
    const { contextText, sources } = await retrieveContext(question.trim(), targetSpaceIds, 5, docIdFilter);

    // 2. LLM Answer Generation
    const answer = await generateAnswer(question.trim(), contextText);

    // 3. Log Audit Query
    await logAuthAttempt('CHAT_QUERY', req.user.email, req, {
      question: question.trim(),
      targetSpaceIds,
      documentIds: docIdFilter,
      sourcesCount: sources.length
    });

    return successResponse(res, 'Response generated successfully', {
      question: question.trim(),
      answer,
      sources,
      targetSpaceIds
    });
  } catch (err) {
    console.error('Chat query error:', err);
    return next(err);
  }
};

module.exports = { handleChatQuery };
