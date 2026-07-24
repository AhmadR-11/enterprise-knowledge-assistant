// backend/src/models/postgres/documentChunk.model.js
const pool = require('../../config/db.postgres');

const insertChunk = async (documentId, spaceId, content, embedding, pageNumber, chunkIndex) => {
  const { rows } = await pool.query(
    `INSERT INTO document_chunks (document_id, space_id, content, embedding, page_number, chunk_index)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [documentId, spaceId, content, JSON.stringify(embedding), pageNumber, chunkIndex]
  );
  return rows[0];
};

const deleteChunksByDocumentId = async (documentId) => {
  const { rowCount } = await pool.query(
    `DELETE FROM document_chunks WHERE document_id = $1`,
    [documentId]
  );
  return rowCount;
};

const getChunksByDocumentId = async (documentId) => {
  const { rows } = await pool.query(
    `SELECT id, document_id, space_id, content, page_number, chunk_index, created_at
     FROM document_chunks WHERE document_id = $1 ORDER BY chunk_index ASC`,
    [documentId]
  );
  return rows;
};

const countChunksBySpaceId = async (spaceId) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM document_chunks WHERE space_id = $1`,
    [spaceId]
  );
  return parseInt(rows[0].count, 10);
};

const countAllChunks = async () => {
  const { rows } = await pool.query(`SELECT COUNT(*) as count FROM document_chunks`);
  return parseInt(rows[0].count, 10);
};

const searchChunksByVector = async (embedding, spaceIds, topK = 5, documentIds = null) => {
  const embeddingJson = JSON.stringify(embedding);
  const conditions = [];
  const params = [embeddingJson];

  if (spaceIds && spaceIds.length > 0) {
    params.push(spaceIds);
    conditions.push(`space_id = ANY($${params.length}::int[])`);
  }

  if (documentIds && documentIds.length > 0) {
    params.push(documentIds);
    conditions.push(`document_id = ANY($${params.length})`);
  }

  let query = `
    SELECT id, document_id, space_id, content, page_number, chunk_index,
           1 - (embedding <=> $1::vector) AS similarity
    FROM document_chunks
  `;

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(' AND ');
  }

  query += ` ORDER BY embedding <=> $1::vector ASC LIMIT ${parseInt(topK, 10)}`;

  const { rows } = await pool.query(query, params);
  return rows;
};

module.exports = {
  insertChunk,
  deleteChunksByDocumentId,
  getChunksByDocumentId,
  countChunksBySpaceId,
  countAllChunks,
  searchChunksByVector
};
