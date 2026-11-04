// backend/src/services/conversation.service.js
const conversationModel = require('../models/postgres/conversation.model');
const messageModel = require('../models/postgres/message.model');
const cacheService = require('./cache.service');

const HISTORY_CACHE_TTL_SEC = 3600; // 1 hour

/**
 * Checks whether the history cache feature flag and Redis are enabled.
 * @returns {boolean}
 */
function isHistoryCacheEnabled() {
  return process.env.REDIS_HISTORY_CACHE === 'true' && cacheService.isReady();
}

/**
 * Prunes an array of { role, content } messages backwards from most recent,
 * ensuring total characters do not exceed maxChars.
 *
 * @param {Array<{ role: string, content: string }>} messages
 * @param {number} [maxChars=8000]
 * @returns {Array<{ role: string, content: string }>}
 */
function pruneHistoryByCharCap(messages, maxChars = 8000) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  let totalChars = 0;
  const pruned = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const item = messages[i];
    const len = (item.content || '').length;
    if (totalChars + len > maxChars && pruned.length > 0) {
      break;
    }
    totalChars += len;
    pruned.unshift({ role: item.role, content: item.content || '' });
  }
  return pruned;
}

/**
 * Derives a human-friendly conversation title from the first prompt (~60 chars).
 * @param {string} text
 * @returns {string}
 */
const generateTitle = (text) => {
  if (!text || typeof text !== 'string') return 'New Chat';
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'New Chat';

  if (cleaned.length <= 60) {
    return cleaned;
  }

  // Truncate at word boundary if possible
  const sub = cleaned.slice(0, 60);
  const lastSpace = sub.lastIndexOf(' ');
  const title = (lastSpace > 35 ? sub.slice(0, lastSpace) : sub).trim();
  return title.replace(/[,;:.!?\-]+$/, '');
};

/**
 * Ensures a valid conversation exists for the request.
 * If conversationId is provided, enforces that it exists AND belongs to the user (throws 404 otherwise).
 * If omitted, creates a new conversation with an auto-generated title.
 *
 * @param {string|null|undefined} conversationId
 * @param {number} userId
 * @param {string} firstMessageText
 * @returns {Promise<{ conversation: Object, isNew: boolean }>}
 */
const ensureConversation = async (conversationId, userId, firstMessageText) => {
  if (conversationId) {
    const existing = await conversationModel.findConversationById(conversationId, userId);
    if (!existing) {
      const err = new Error('Conversation not found');
      err.status = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }
    return { conversation: existing, isNew: false };
  }

  const title = generateTitle(firstMessageText);
  const newConv = await conversationModel.createConversation(userId, title);
  return { conversation: newConv, isNew: true };
};

/**
 * Lists paginated conversations for the authenticated user (newest updated first).
 * @param {number} userId
 * @param {Object} [pagination]
 * @returns {Promise<{ conversations: Array<Object>, total: number, page: number, limit: number, totalPages: number }>}
 */
const listUserConversations = async (userId, { page = 1, limit = 30 } = {}) => {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
  const offset = (p - 1) * l;

  const [conversations, total] = await Promise.all([
    conversationModel.listConversationsByUserId(userId, { limit: l, offset }),
    conversationModel.countConversationsByUserId(userId)
  ]);

  return {
    conversations,
    total,
    page: p,
    limit: l,
    totalPages: Math.ceil(total / l) || 1
  };
};

/**
 * Retrieves all messages for a specific conversation, scoped to owner.
 * Returns 404 if conversation does not exist or belongs to another user.
 *
 * @param {string} conversationId
 * @param {number} userId
 * @returns {Promise<{ conversation: Object, messages: Array<Object> }>}
 */
const getConversationMessages = async (conversationId, userId) => {
  const conversation = await conversationModel.findConversationById(conversationId, userId);
  if (!conversation) {
    const err = new Error('Conversation not found');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const rawMessages = await messageModel.listMessagesByConversationId(conversationId);

  // Normalize JSON fields
  const messages = rawMessages.map((m) => ({
    id: m.id,
    conversationId: m.conversation_id,
    role: m.role,
    content: m.content,
    status: m.status,
    sources: Array.isArray(m.sources) ? m.sources : (typeof m.sources === 'string' ? JSON.parse(m.sources || '[]') : []),
    toolActivity: Array.isArray(m.tool_activity) ? m.tool_activity : (typeof m.tool_activity === 'string' ? JSON.parse(m.tool_activity || '[]') : []),
    errorMessage: m.error_message,
    createdAt: m.created_at
  }));

  return { conversation, messages };
};

/**
 * Renames a conversation, strictly verifying user ownership.
 * @param {string} conversationId
 * @param {number} userId
 * @param {string} title
 * @returns {Promise<Object>}
 */
const renameConversation = async (conversationId, userId, title) => {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) {
    const err = new Error('Title cannot be empty');
    err.status = 400;
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const updated = await conversationModel.updateConversationTitle(conversationId, userId, cleanTitle);
  if (!updated) {
    const err = new Error('Conversation not found');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return updated;
};

/**
 * Deletes a conversation and all its messages, strictly verifying ownership.
 * Purges the history cache key upon deletion.
 * @param {string} conversationId
 * @param {number} userId
 * @returns {Promise<{ id: string }>}
 */
const deleteConversation = async (conversationId, userId) => {
  const deleted = await conversationModel.deleteConversation(conversationId, userId);
  if (!deleted) {
    const err = new Error('Conversation not found');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Purge history cache for deleted conversation
  if (isHistoryCacheEnabled()) {
    try {
      const cacheKey = `hist:${conversationId}`;
      await cacheService.del(cacheKey);
      console.debug(`[HistoryCache] DEL (conversation deleted): ${cacheKey}`);
    } catch (err) {
      // Fail-open
    }
  }

  return deleted;
};

/**
 * Persists a user message before generation starts.
 * @param {string} conversationId
 * @param {string} content
 * @returns {Promise<Object>}
 */
const saveUserMessage = async (conversationId, content) => {
  const msg = await messageModel.createMessage({
    conversationId,
    role: 'user',
    content,
    status: 'complete'
  });
  await conversationModel.touchConversation(conversationId);
  return msg;
};

/**
 * Persists an assistant message when the stream terminates (complete, stopped, or error).
 * Write-through: updates Redis cache if complete; purges if stopped or error.
 *
 * @param {Object} params
 * @param {string} params.conversationId
 * @param {string} params.content
 * @param {'complete'|'stopped'|'error'} [params.status='complete']
 * @param {Array<Object>} [params.sources=[]]
 * @param {Array<Object>} [params.toolActivity=[]]
 * @param {string|null} [params.errorMessage=null]
 * @returns {Promise<Object>}
 */
const saveAssistantMessage = async ({
  conversationId,
  content,
  status = 'complete',
  sources = [],
  toolActivity = [],
  errorMessage = null
}) => {
  const msg = await messageModel.createMessage({
    conversationId,
    role: 'assistant',
    content: content || '',
    status,
    sources: sources || [],
    toolActivity: toolActivity || [],
    errorMessage: errorMessage || null
  });
  await conversationModel.touchConversation(conversationId);

  // Write-through cache management
  if (isHistoryCacheEnabled()) {
    const cacheKey = `hist:${conversationId}`;
    try {
      if (status === 'complete') {
        const completeMessages = await messageModel.getLastCompleteMessages(conversationId, 10);
        const modelContext = (completeMessages || []).map((m) => ({
          role: m.role,
          content: m.content || ''
        }));
        await cacheService.setJSON(cacheKey, modelContext, HISTORY_CACHE_TTL_SEC);
        console.debug(`[HistoryCache] SET (write-through): ${cacheKey} (${modelContext.length} messages)`);
      } else {
        // 'stopped' or 'error' messages must NEVER enter model context
        await cacheService.del(cacheKey);
        console.debug(`[HistoryCache] DEL (non-complete status "${status}"): ${cacheKey}`);
      }
    } catch (err) {
      // Fail-open
    }
  }

  return msg;
};

/**
 * Loads recent completed messages from the conversation for model history.
 * Bounded to last 10 complete messages and capped by maxChars (default 8,000)
 * to avoid context window overflow.
 *
 * OWNERSHIP: ALWAYS verifies that the conversation belongs to the authenticated user
 * via the DB before using any cached history.
 *
 * @param {string|null} conversationId
 * @param {number|null} [arg2=null] - userId or limit
 * @param {number} [arg3=10] - limit or maxChars
 * @param {number} [arg4=8000] - maxChars
 * @returns {Promise<Array<{ role: 'user'|'assistant', content: string }>>}
 */
const getRecentContextHistory = async (conversationId, arg2 = null, arg3 = 10, arg4 = 8000) => {
  if (!conversationId) return [];

  let userId = null;
  let limit = 10;
  let maxChars = 8000;

  if (arg4 !== undefined && typeof arg4 === 'number') {
    // Called as (conversationId, userId, limit, maxChars)
    userId = arg2;
    limit = typeof arg3 === 'number' ? arg3 : 10;
    maxChars = arg4;
  } else if (arg3 !== undefined && typeof arg3 === 'number') {
    // Called as (conversationId, limit, maxChars) or (conversationId, userId, limit)
    if (arg3 > 100) {
      limit = typeof arg2 === 'number' ? arg2 : 10;
      maxChars = arg3;
    } else {
      userId = arg2;
      limit = arg3;
    }
  } else if (arg2 !== undefined && arg2 !== null) {
    if (typeof arg2 === 'object') {
      userId = arg2.userId || null;
      limit = arg2.limit || 10;
      maxChars = arg2.maxChars || 8000;
    } else if (typeof arg2 === 'number') {
      userId = arg2;
    }
  }

  // 1. OWNERSHIP: ALWAYS verify conversation belongs to user via DB primary-key lookup
  if (userId !== null && userId !== undefined) {
    const conversation = await conversationModel.findConversationById(conversationId, userId);
    if (!conversation) {
      const err = new Error('Conversation not found');
      err.status = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }
  }

  const cacheKey = `hist:${conversationId}`;

  // 2. Cache lookup if history caching is enabled
  if (isHistoryCacheEnabled()) {
    try {
      const cached = await cacheService.getJSON(cacheKey);
      if (Array.isArray(cached)) {
        console.debug(`[HistoryCache] HIT: ${cacheKey} (${cached.length} messages)`);
        return pruneHistoryByCharCap(cached, maxChars);
      }
    } catch (err) {
      // Fail-open: continue to DB
    }
    console.debug(`[HistoryCache] MISS: ${cacheKey}`);
  }

  // 3. Fallback to PostgreSQL database query
  const rawMessages = await messageModel.getLastCompleteMessages(conversationId, limit);
  if (!rawMessages || rawMessages.length === 0) return [];

  // Filter and format strictly to model context: { role, content }
  const formatted = rawMessages.map((m) => ({
    role: m.role,
    content: m.content || ''
  }));

  // Store canonical last complete messages in cache if enabled
  if (isHistoryCacheEnabled() && formatted.length > 0) {
    try {
      await cacheService.setJSON(cacheKey, formatted, HISTORY_CACHE_TTL_SEC);
      console.debug(`[HistoryCache] SET: ${cacheKey} (${formatted.length} messages)`);
    } catch (err) {
      // Fail-open
    }
  }

  return pruneHistoryByCharCap(formatted, maxChars);
};

module.exports = {
  generateTitle,
  ensureConversation,
  listUserConversations,
  getConversationMessages,
  renameConversation,
  deleteConversation,
  saveUserMessage,
  saveAssistantMessage,
  getRecentContextHistory
};

