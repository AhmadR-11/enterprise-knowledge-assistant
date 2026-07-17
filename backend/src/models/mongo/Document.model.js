// backend/src/models/mongo/Document.model.js
const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  mimeType:     { type: String, required: true },
  spaceId:      { type: Number, required: true, index: true },
  uploadedBy:   { type: Number, required: true },  // PostgreSQL user id
  status: {
    type: String,
    enum: ['pending', 'processing', 'ready', 'failed'],
    default: 'pending',
    index: true
  },
  chunkCount:   { type: Number, default: 0 },
  errorMessage: { type: String },
  createdAt:    { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('Document', DocumentSchema);
