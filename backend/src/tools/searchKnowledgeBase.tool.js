// backend/src/tools/searchKnowledgeBase.tool.js
const { z } = require('zod');
const retrievalService = require('../services/retrieval.service');

/**
 * Zod schema for searchKnowledgeBase tool arguments.
 */
const searchKnowledgeBaseSchema = z.object({
  query: z.string().min(2, 'Search query must be at least 2 characters long'),
  topK: z.number().int().min(1).max(8).optional().default(5)
});

/**
 * OpenAPI-compatible Gemini function declaration.
 */
const searchKnowledgeBaseDeclaration = {
  name: 'searchKnowledgeBase',
  description: 'Search the enterprise knowledge base for relevant document excerpts based on semantic and keyword similarity. Call this tool whenever the user asks for facts, concepts, documentation, or policies from their assigned workspaces.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query string (minimum 2 characters).'
      },
      topK: {
        type: 'integer',
        description: 'Number of top matching excerpts to retrieve (between 1 and 8, defaults to 5).'
      }
    },
    required: ['query']
  }
};

/**
 * Executes semantic vector search against user-authorized spaces.
 * @param {z.infer<typeof searchKnowledgeBaseSchema>} args
 * @param {Object} userContext
 * @param {number[]|null} userContext.targetSpaceIds
 * @param {string[]|null} [userContext.docIdFilter]
 * @param {Array<Object>} userContext.accumulatedSources
 * @returns {Promise<Object>}
 */
const executeSearchKnowledgeBase = async (args, userContext) => {
  const { query, topK } = args;
  const targetSpaceIds = userContext?.targetSpaceIds || null;
  const docIdFilter = userContext?.docIdFilter || null;

  const retrievalResult = await retrievalService.retrieveContext(
    query,
    targetSpaceIds,
    topK || 5,
    docIdFilter
  );

  const excerpts = (retrievalResult.chunks || []).map((chunk) => {
    const rawContent = chunk.content || '';
    const snippet = rawContent.length > 400 ? rawContent.slice(0, 400).trim() + '...' : rawContent.trim();
    const score = Math.round((chunk.similarity || 0) * 100) / 100;

    return {
      documentId: String(chunk.documentId || chunk.id),
      title: chunk.documentTitle || 'Document',
      originalName: chunk.originalName || chunk.documentTitle || 'Document',
      pageNumber: chunk.pageNumber || null,
      snippet,
      score
    };
  });

  // Track sources for the final SSE 'sources' event
  if (Array.isArray(userContext?.accumulatedSources)) {
    for (const item of excerpts) {
      userContext.accumulatedSources.push({
        documentId: item.documentId,
        title: item.title,
        originalName: item.originalName,
        pageNumber: item.pageNumber,
        score: item.score
      });
    }
  }

  return {
    success: true,
    query,
    count: excerpts.length,
    excerpts
  };
};

module.exports = {
  name: 'searchKnowledgeBase',
  schema: searchKnowledgeBaseSchema,
  declaration: searchKnowledgeBaseDeclaration,
  execute: executeSearchKnowledgeBase
};

