// backend/src/migrations/migrate.js
const fs = require('fs');
const path = require('path');
const pool = require('../config/db.postgres');

/**
 * Runs the database migrations idempotently against PostgreSQL.
 */
async function runMigrations() {
  console.log('🚀 Running database migrations...');
  const sqlPath = path.join(__dirname, '001_create_conversations_and_messages.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Migrations completed successfully: conversations & messages tables verified');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = runMigrations;

