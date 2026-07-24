// backend/src/app.js
const express = require('express');
const cors = require('cors');

const authRoutes     = require('./routes/auth.routes');
const spaceRoutes    = require('./routes/space.routes');
const auditRoutes    = require('./routes/audit.routes');
const userRoutes     = require('./routes/user.routes');
const documentRoutes = require('./routes/document.routes');
const chatRoutes     = require('./routes/chat.routes');
const errorHandler   = require('./middleware/errorHandler.middleware');

const app = express();

// Core middlewares
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Backend is running' });
});

// Routes
app.use('/api/auth',      authRoutes);
app.use('/api/spaces',    spaceRoutes);
app.use('/api/audit',     auditRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/chat',      chatRoutes);

// Global error handler — must be last
app.use(errorHandler);

module.exports = app;
