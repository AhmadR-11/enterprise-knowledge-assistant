// backend/src/services/retrieval.service.js
const genAI = require('../config/gemini');
const { searchChunksByVector } = require('../models/postgres/documentChunk.model');
const Document = require('../models/mongo/Document.model');

const retrieveContext = async (queryText, spaceIds = null, topK = 5, documentIds = null) => {
  // Generate query embedding using Gemini gemini-embedding-001 (768-dim)
  const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const res = await embeddingModel.embedContent({
    content: { parts: [{ text: queryText }] },
    outputDimensionality: 768
  });
  const queryEmbedding = res.embedding.values;

  // Search pgvector for most relevant chunks
  const chunks = await searchChunksByVector(queryEmbedding, spaceIds, topK, documentIds);

  if (!chunks || chunks.length === 0) {
    return { contextText: '', chunks: [], sources: [] };
  }

  // Fetch document metadata for citations
  const docIds = [...new Set(chunks.map(c => c.document_id))];
  const docs = await Document.find({ _id: { $in: docIds } }).lean();
  const docMap = new Map();
  docs.forEach(d => docMap.set(String(d._id), d));

  const enrichedChunks = chunks.map(c => {
    const doc = docMap.get(String(c.document_id));
    return {
      id: c.id,
      documentId: c.document_id,
      documentTitle: doc?.title || doc?.originalName || 'Document',
      spaceId: c.space_id,
      content: c.content,
      pageNumber: c.page_number,
      similarity: c.similarity
    };
  });

  const contextText = enrichedChunks
    .map(c => `[Source: ${c.documentTitle} | Page ${c.pageNumber}]\n${c.content}`)
    .join('\n\n');

  return {
    contextText,
    chunks: enrichedChunks,
    sources: enrichedChunks.map(c => ({
      documentTitle: c.documentTitle,
      pageNumber: c.pageNumber,
      similarity: Math.round(c.similarity * 100) / 100
    }))
  };
};

module.exports = { retrieveContext };
