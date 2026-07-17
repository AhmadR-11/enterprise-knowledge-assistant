// backend/src/server.js
require('dotenv').config();
const app = require('./app');
const connectMongo = require('./config/db.mongo');
const postgresPool = require('./config/db.postgres');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // 1. Connect to MongoDB Atlas
    console.log('Connecting to MongoDB Atlas...');
    await connectMongo();

    // 2. Test PostgreSQL Connection
    console.log('Testing PostgreSQL (Neon) connection...');
    const pgTest = await postgresPool.query('SELECT NOW()');
    console.log('PostgreSQL Connection verified at:', pgTest.rows[0].now);

    // 3. Start Express Server
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Critical Server Initialization Error:', error.message);
    process.exit(1);
  }
};

startServer();
