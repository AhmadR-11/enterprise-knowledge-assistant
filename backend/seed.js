// seed.js — Seeds Admin, Editor, and Viewer accounts + default Space
// Usage:
//   node seed.js          -> Seeds accounts if they don't already exist
//   node seed.js --clean  -> Clears all existing DB data first, then seeds fresh accounts

require('dotenv').config();
const mongoose     = require('mongoose');
const connectMongo = require('./src/config/db.mongo');
const pool         = require('./src/config/db.postgres');
const bcrypt       = require('bcrypt');

const ACCOUNTS = [
  { email: 'admin@gmail.com',  password: 'admin@1234',  role: 'admin' },
  { email: 'editor@gmail.com', password: 'editor@1234', role: 'editor' },
  { email: 'viewer@gmail.com', password: 'viewer@1234', role: 'viewer' }
];

const DEFAULT_SPACE = {
  name: 'General Knowledge',
  description: 'Default company workspace for cross-departmental documentation'
};

async function cleanAll() {
  console.log('🧹 Cleaning existing data from databases...');
  
  // 1. Clean PostgreSQL tables
  await pool.query('DELETE FROM document_chunks');
  await pool.query('DELETE FROM user_spaces');
  await pool.query('DELETE FROM spaces');
  await pool.query('DELETE FROM users');
  console.log('   ✅ PostgreSQL: document_chunks, user_spaces, spaces, users cleared');

  // 2. Clean MongoDB collections
  if (mongoose.connection?.db) {
    await mongoose.connection.db.collection('documents').deleteMany({});
    await mongoose.connection.db.collection('auditlogs').deleteMany({});
    console.log('   ✅ MongoDB: documents and auditlogs collections cleared');
  }
}

async function seed() {
  const shouldClean = process.argv.includes('--clean');
  console.log(shouldClean ? '🔄 Full Database Reset & Seed...' : '🌱 Seeding role accounts...');

  await connectMongo();
  await pool.query('SELECT 1');

  try {
    if (shouldClean) {
      await cleanAll();
    }

    // 1. Create or ensure accounts exist
    const createdUsers = {};
    for (const acc of ACCOUNTS) {
      const existing = await pool.query('SELECT id, email, role FROM users WHERE email = $1', [acc.email]);
      if (existing.rows.length > 0) {
        console.log(`ℹ️  User already exists: ${acc.email} (${acc.role})`);
        createdUsers[acc.role] = existing.rows[0];
      } else {
        const hash = await bcrypt.hash(acc.password, 10);
        const { rows } = await pool.query(
          `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role`,
          [acc.email, hash, acc.role]
        );
        console.log(`✅ Created ${acc.role.toUpperCase()}: ${acc.email}`);
        createdUsers[acc.role] = rows[0];
      }
    }

    // 2. Create or ensure default Space exists
    let spaceId;
    const existingSpace = await pool.query('SELECT id, name FROM spaces WHERE name = $1', [DEFAULT_SPACE.name]);
    if (existingSpace.rows.length > 0) {
      spaceId = existingSpace.rows[0].id;
      console.log(`ℹ️  Default Space already exists: "${DEFAULT_SPACE.name}" (ID: ${spaceId})`);
    } else {
      const { rows } = await pool.query(
        `INSERT INTO spaces (name, description) VALUES ($1, $2) RETURNING id, name`,
        [DEFAULT_SPACE.name, DEFAULT_SPACE.description]
      );
      spaceId = rows[0].id;
      console.log(`✅ Created Default Space: "${DEFAULT_SPACE.name}" (ID: ${spaceId})`);
    }

    // 3. Assign Editor and Viewer to Default Space
    for (const role of ['editor', 'viewer']) {
      const user = createdUsers[role];
      if (user && spaceId) {
        await pool.query(
          `INSERT INTO user_spaces (user_id, space_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [user.id, spaceId]
        );
        console.log(`🔗 Assigned ${role} (${user.email}) to "${DEFAULT_SPACE.name}"`);
      }
    }

    console.log('\n======================================================');
    console.log('🎉 CREDENTIALS READY FOR ALL ROLES:');
    console.log('======================================================');
    console.log('🛡️  ADMIN:');
    console.log('   📧 Email:    admin@gmail.com');
    console.log('   🔑 Password: admin@1234');
    console.log('   ⭐ Access:   All spaces, users, admin panel, audit logs, chat\n');
    console.log('✏️  EDITOR:');
    console.log('   📧 Email:    editor@gmail.com');
    console.log('   🔑 Password: editor@1234');
    console.log('   ⭐ Access:   Assigned space ("General Knowledge"), upload docs, chat\n');
    console.log('👁️  VIEWER:');
    console.log('   📧 Email:    viewer@gmail.com');
    console.log('   🔑 Password: viewer@1234');
    console.log('   ⭐ Access:   Assigned space ("General Knowledge"), read-only docs, chat');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Seeding error:', err.message);
  } finally {
    await pool.end();
    if (mongoose?.connection) {
      await mongoose.connection.close();
    }
    process.exit(0);
  }
}

seed();

