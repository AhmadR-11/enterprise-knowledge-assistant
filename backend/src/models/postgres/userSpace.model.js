// backend/src/models/postgres/userSpace.model.js
const pool = require('../../config/db.postgres');

const assignUserToSpace = async (userId, spaceId) => {
  const query = `
    INSERT INTO user_spaces (user_id, space_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING
    RETURNING user_id, space_id
  `;
  const { rows } = await pool.query(query, [userId, spaceId]);
  return rows[0];
};

const removeUserFromSpace = async (userId, spaceId) => {
  const query = `
    DELETE FROM user_spaces
    WHERE user_id = $1 AND space_id = $2
    RETURNING user_id, space_id
  `;
  const { rows } = await pool.query(query, [userId, spaceId]);
  return rows[0];
};

const checkSpaceMembership = async (userId, spaceId) => {
  const query = `
    SELECT 1
    FROM user_spaces
    WHERE user_id = $1 AND space_id = $2
    LIMIT 1
  `;
  const { rows } = await pool.query(query, [userId, spaceId]);
  return rows.length > 0;
};

const listUsersInSpace = async (spaceId) => {
  const query = `
    SELECT u.id, u.email, u.role, u.created_at
    FROM users u
    JOIN user_spaces us ON u.id = us.user_id
    WHERE us.space_id = $1
    ORDER BY u.email ASC
  `;
  const { rows } = await pool.query(query, [spaceId]);
  return rows;
};

module.exports = {
  assignUserToSpace,
  removeUserFromSpace,
  checkSpaceMembership,
  listUsersInSpace
};
