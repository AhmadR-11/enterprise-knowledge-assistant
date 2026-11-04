// backend/src/models/postgres/conversation.model.js
const pool = require('../../config/db.postgres');

/**
 * Creates a new conversation for an authenticated user.
 * @param {number} userId - Owner ID
 * @param {string} title - Conversation title
 * @returns {Promise<Object>}
 */
const createConversation = async (userId, title) => {
  const { rows } = await pool.query(
    `INSERT INTO conversations (user_id, title)
     VALUES ($1, $2)
     RETURNING id, user_id, title, created_at, updated_at`,
    [userId, title]
  );
  return rows[0];
};

/**
 * Finds a conversation by ID, strictly scoped by user_id.
 * Returns null if not found or owned by another user.
 * @param {string} id - UUID
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
const findConversationById = async (id, userId) => {
  const { rows } = await pool.query(
    `SELECT id, user_id, title, created_at, updated_at
     FROM conversations
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
};

/**
 * Lists conversations for a user, sorted newest updated first.
 * @param {number} userId
 * @param {Object} [pagination]
 * @param {number} [pagination.limit]
 * @param {number} [pagination.offset]
 * @returns {Promise<Array<Object>>}
 */
const listConversationsByUserId = async (userId, { limit = 30, offset = 0 } = {}) => {
  const { rows } = await pool.query(
    `SELECT id, user_id, title, created_at, updated_at
     FROM conversations
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return rows;
};

/**
 * Counts total conversations for a user.
 * @param {number} userId
 * @returns {Promise<number>}
 */
const countConversationsByUserId = async (userId) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM conversations WHERE user_id = $1`,
    [userId]
  );
  return parseInt(rows[0]?.count || '0', 10);
};

/**
 * Updates the title of a conversation, updating updated_at.
 * Scoped strictly to owner user_id.
 * @param {string} id - UUID
 * @param {number} userId
 * @param {string} title
 * @returns {Promise<Object|null>}
 */
const updateConversationTitle = async (id, userId, title) => {
  const { rows } = await pool.query(
    `UPDATE conversations
     SET title = $3, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, title, created_at, updated_at`,
    [id, userId, title]
  );
  return rows[0] || null;
};

/**
 * Touches the updated_at timestamp of a conversation.
 * @param {string} id - UUID
 * @returns {Promise<void>}
 */
const touchConversation = async (id) => {
  await pool.query(
    `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
    [id]
  );
};

/**
 * Deletes a conversation by ID, strictly scoped to user_id.
 * Cascade deletes associated messages via foreign key.
 * @param {string} id - UUID
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
const deleteConversation = async (id, userId) => {
  const { rows } = await pool.query(
    `DELETE FROM conversations
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [id, userId]
  );
  return rows[0] || null;
};

module.exports = {
  createConversation,
  findConversationById,
  listConversationsByUserId,
  countConversationsByUserId,
  updateConversationTitle,
  touchConversation,
  deleteConversation
};

