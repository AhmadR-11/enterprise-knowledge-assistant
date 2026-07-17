// backend/src/models/postgres/space.model.js
const pool = require('../../config/db.postgres');

const createSpace = async (name, description) => {
  const { rows } = await pool.query(
    `INSERT INTO spaces (name, description) VALUES ($1, $2) RETURNING id, name, description`,
    [name, description]
  );
  return rows[0];
};

const findSpaceById = async (id) => {
  const { rows } = await pool.query(
    `SELECT id, name, description FROM spaces WHERE id = $1`,
    [id]
  );
  return rows[0];
};

const findSpaceByName = async (name) => {
  const { rows } = await pool.query(
    `SELECT id, name, description FROM spaces WHERE name = $1`,
    [name]
  );
  return rows[0];
};

const listAllSpaces = async () => {
  const { rows } = await pool.query(
    `SELECT id, name, description FROM spaces ORDER BY name ASC`
  );
  return rows;
};

const listSpacesByUserId = async (userId) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.description
     FROM spaces s
     JOIN user_spaces us ON s.id = us.space_id
     WHERE us.user_id = $1
     ORDER BY s.name ASC`,
    [userId]
  );
  return rows;
};

const updateSpace = async (id, name, description) => {
  const { rows } = await pool.query(
    `UPDATE spaces SET name = COALESCE($2, name), description = COALESCE($3, description)
     WHERE id = $1 RETURNING id, name, description`,
    [id, name, description]
  );
  return rows[0];
};

const deleteSpace = async (id) => {
  const { rows } = await pool.query(
    `DELETE FROM spaces WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows[0];
};

module.exports = {
  createSpace,
  findSpaceById,
  findSpaceByName,
  listAllSpaces,
  listSpacesByUserId,
  updateSpace,
  deleteSpace
};
