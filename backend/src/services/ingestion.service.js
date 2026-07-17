// backend/src/services/ingestion.service.js
const openai = require('../config/openai');
const extractText = require('../utils/extractText');
const chunkText = require('../utils/chunkText');
const Document = require('../models/mongo/Document.model');
const { insertChunk, deleteChunksByDocumentId } = require('../models/postgres/documentChunk.model');

const EMBEDDING_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 20; // embed 20 chunks per OpenAI call

/**
 * Embed an array of text strings in batches
 */
const embedBatch = async (texts) => {
  const embeddings = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch
    });
    embeddings.push(...response.data.map((d) => d.embedding));
  }
  return embeddings;
};

/**
 * Run the full ingestion pipeline for a new document upload
 * @param {Object} file - multer file object (buffer, mimetype, originalname)
 * @param {number} spaceId
 * @param {number} uploadedBy - user id
 * @returns {Promise<Object>} - saved Document record
 */
const ingestDocument = async (file, spaceId, uploadedBy) => {
  // 1. Save document metadata with status 'processing'
  const doc = await Document.create({
    originalName: file.originalname,
    mimeType: file.mimetype,
    spaceId,
    uploadedBy,
    status: 'processing'
  });

  try {
    // 2. Extract text
    const text = await extractText(file.buffer, file.mimetype);

    // 3. Chunk
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      await Document.findByIdAndUpdate(doc._id, {
        status: 'failed',
        errorMessage: 'No extractable text found in document'
      });
      return doc;
    }

    // 4. Embed in batches
    const texts = chunks.map((c) => c.content);
    const embeddings = await embedBatch(texts);

    // 5. Insert chunks into Neon
    await Promise.all(
      chunks.map((chunk, idx) =>
        insertChunk(doc._id.toString(), spaceId, chunk.content, embeddings[idx], null, chunk.chunkIndex)
      )
    );

    // 6. Mark document as ready
    await Document.findByIdAndUpdate(doc._id, {
      status: 'ready',
      chunkCount: chunks.length
    });

    return { ...doc.toObject(), status: 'ready', chunkCount: chunks.length };
  } catch (error) {
    await Document.findByIdAndUpdate(doc._id, {
      status: 'failed',
      errorMessage: error.message
    });
    throw error;
  }
};

/**
 * Re-process an existing document (delete old chunks, re-ingest from stored metadata)
 * NOTE: We cannot re-extract text since the file is not persisted.
 * Re-process deletes and re-embeds from the existing chunk content already stored.
 * @param {string} documentId - MongoDB document _id
 */
const reprocessDocument = async (documentId) => {
  const doc = await Document.findById(documentId);
  if (!doc) throw new Error('Document not found');

  // Update status
  await Document.findByIdAndUpdate(documentId, { status: 'processing', chunkCount: 0 });

  try {
    // 1. Fetch existing chunk content from Neon
    const { getChunksByDocumentId } = require('../models/postgres/documentChunk.model');
    const existingChunks = await getChunksByDocumentId(documentId);
    if (existingChunks.length === 0) {
      await Document.findByIdAndUpdate(documentId, {
        status: 'failed',
        errorMessage: 'No existing chunks to reprocess'
      });
      return;
    }

    // 2. Delete old chunks
    await deleteChunksByDocumentId(documentId);

    // 3. Re-embed
    const texts = existingChunks.map((c) => c.content);
    const embeddings = await embedBatch(texts);

    // 4. Re-insert with fresh embeddings
    await Promise.all(
      existingChunks.map((chunk, idx) =>
        insertChunk(documentId, doc.spaceId, chunk.content, embeddings[idx], chunk.page_number, chunk.chunk_index)
      )
    );

    await Document.findByIdAndUpdate(documentId, {
      status: 'ready',
      chunkCount: existingChunks.length
    });
  } catch (error) {
    await Document.findByIdAndUpdate(documentId, {
      status: 'failed',
      errorMessage: error.message
    });
    throw error;
  }
};

module.exports = { ingestDocument, reprocessDocument };
