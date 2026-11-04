// backend/src/server.js
require('dotenv').config();
const app = require('./app');
const connectMongo = require('./config/db.mongo');
const postgresPool = require('./config/db.postgres');

const PORT = process.env.PORT || 5000;
const runMigrations = require('./migrations/migrate');
const { closeRedis } = require('./services/redis.client');

let server = null;

const startServer = async () => {
  try {
    // 1. Connect to MongoDB Atlas
    console.log('Connecting to MongoDB Atlas...');
    await connectMongo();

    // 2. Test PostgreSQL Connection & ensure tables
    console.log('Testing PostgreSQL (Neon) connection...');
    const pgTest = await postgresPool.query('SELECT NOW()');
    console.log('PostgreSQL Connection verified at:', pgTest.rows[0].now);

    // 3. Run migrations (idempotent: conversations & messages)
    await runMigrations();

    // 4. Start Express Server
    server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Critical Server Initialization Error:', error.message);
    process.exit(1);
  }
};

// Graceful shutdown handler
const shutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Gracefully stopping server...`);
  if (server) {
    server.close(async () => {
      console.log('HTTP server closed.');
      await closeRedis();
      try { await postgresPool.end(); } catch {}
      console.log('All connections closed. Exiting.');
      process.exit(0);
    });

    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
      console.error('Forcefully exiting after shutdown timeout.');
      process.exit(1);
    }, 10000).unref();
  } else {
    await closeRedis();
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Process safety handlers for robust long-running server
process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ Warning: Unhandled Promise Rejection intercepted:', reason?.message || reason);
});

startServer();
