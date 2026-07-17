// backend/src/config/db.postgres.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.PG_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false }, // required for Neon/Supabase hosted connections
});

pool.on('connect', () => {
  console.log('PostgreSQL (Neon) connected');
});

module.exports = pool;