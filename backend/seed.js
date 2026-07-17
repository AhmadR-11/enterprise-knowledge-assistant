// seed.js — Run ONCE to create your admin account
// Usage: node seed.js
// Run from: /backend directory

require('dotenv').config();
const connectMongo = require('./src/config/db.mongo');
const pool         = require('./src/config/db.postgres');
const bcrypt       = require('bcrypt');

const ADMIN_EMAIL    = 'admin@company.com';
const ADMIN_PASSWORD = 'Admin@1234';

async function seed() {
  console.log('🌱 Seeding admin account...');
  await connectMongo();
  await pool.query('SELECT 1');

  try {
    // Check if already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);
    if (existing.rows.length > 0) {
      console.log(`✅ Admin already exists: ${ADMIN_EMAIL}`);
      return;
    }

    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin') RETURNING id, email, role`,
      [ADMIN_EMAIL, hash]
    );

    console.log('✅ Admin account created!');
    console.log('');
    console.log('  📧 Email:    ' + ADMIN_EMAIL);
    console.log('  🔑 Password: ' + ADMIN_PASSWORD);
    console.log('');
    console.log('Use these credentials to log in at http://localhost:3000');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
    const mongoose = require('mongoose');
    await mongoose.connection.close();
    process.exit(0);
  }
}

seed();
