// backend/src/models/postgres/user.model.js
const pool = require('../../config/db.postgres');

const createUser = async (email, passwordHash, role) => {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, $3)
     RETURNING id, email, role, created_at`,
    [email.toLowerCase(), passwordHash, role]
  );
  return rows[0];
};

const findUserByEmail = async (email) => {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );
  return rows[0];
};

const findUserById = async (id) => {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, role, created_at FROM users WHERE id = $1`,
    [id]
  );
  return rows[0];
};

const listAllUsers = async () => {
  const { rows } = await pool.query(
    `SELECT id, email, role, created_at FROM users ORDER BY created_at DESC`
  );
  return rows;
};

const updateUserRole = async (id, role) => {
  const { rows } = await pool.query(
    `UPDATE users SET role = $2 WHERE id = $1 RETURNING id, email, role`,
    [id, role]
  );
  return rows[0];
};

const deleteUser = async (id) => {
  const { rows } = await pool.query(
    `DELETE FROM users WHERE id = $1 RETURNING id, email`,
    [id]
  );
  return rows[0];
};

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  listAllUsers,
  updateUserRole,
  deleteUser
};
