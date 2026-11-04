// backend/src/models/postgres/message.model.js
const pool = require('../../config/db.postgres');

/**
 * Creates and persists a new message in PostgreSQL.
 * @param {Object} params
 * @param {string} params.conversationId - UUID
 * @param {'user'|'assistant'} params.role
 * @param {string} params.content
 * @param {'complete'|'stopped'|'error'} [params.status='complete']
 * @param {Array<Object>} [params.sources=[]]
 * @param {Array<Object>} [params.toolActivity=[]]
 * @param {string|null} [params.errorMessage=null]
 * @returns {Promise<Object>}
 */
const createMessage = async ({
  conversationId,
  role,
  content,
  status = 'complete',
  sources = [],
  toolActivity = [],
  errorMessage = null
}) => {
  const { rows } = await pool.query(
    `INSERT INTO messages (
       conversation_id, role, content, status, sources, tool_activity, error_message
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, conversation_id, role, content, status, sources, tool_activity, error_message, created_at`,
    [
      conversationId,
      role,
      content,
      status,
      JSON.stringify(sources || []),
      JSON.stringify(toolActivity || []),
      errorMessage
    ]
  );
  return rows[0];
};

/**
 * Lists all messages for a conversation ordered chronologically (oldest first).
 * @param {string} conversationId - UUID
 * @returns {Promise<Array<Object>>}
 */
const listMessagesByConversationId = async (conversationId) => {
  const { rows } = await pool.query(
    `SELECT id, conversation_id, role, content, status, sources, tool_activity, error_message, created_at
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId]
  );
  return rows;
};

/**
 * Retrieves the last N completed messages in chronological order for LLM context.
 * @param {string} conversationId - UUID
 * @param {number} [limit=10]
 * @returns {Promise<Array<Object>>}
 */
const getLastCompleteMessages = async (conversationId, limit = 10) => {
  const { rows } = await pool.query(
    `SELECT id, conversation_id, role, content, status, sources, tool_activity, error_message, created_at
     FROM (
       SELECT id, conversation_id, role, content, status, sources, tool_activity, error_message, created_at
       FROM messages
       WHERE conversation_id = $1 AND status = 'complete'
       ORDER BY created_at DESC
       LIMIT $2
     ) sub
     ORDER BY created_at ASC`,
    [conversationId, limit]
  );
  return rows;
};

/**
 * Counts total messages in a conversation.
 * @param {string} conversationId - UUID
 * @returns {Promise<number>}
 */
const countMessagesByConversationId = async (conversationId) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1`,
    [conversationId]
  );
  return parseInt(rows[0]?.count || '0', 10);
};

module.exports = {
  createMessage,
  listMessagesByConversationId,
  getLastCompleteMessages,
  countMessagesByConversationId
};

