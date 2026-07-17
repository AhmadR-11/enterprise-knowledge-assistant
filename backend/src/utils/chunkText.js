// backend/src/utils/chunkText.js

const CHUNK_SIZE = 1800;   // characters (~450 tokens)
const CHUNK_OVERLAP = 200; // characters overlap between chunks

/**
 * Split text into overlapping chunks
 * @param {string} text - Full document text
 * @returns {Array<{content: string, chunkIndex: number}>}
 */
const chunkText = (text) => {
  // Normalize whitespace
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  if (!normalized) return [];

  const chunks = [];
  let start = 0;
  let index = 0;

  while (start < normalized.length) {
    let end = start + CHUNK_SIZE;

    // Try to break at a sentence or paragraph boundary
    if (end < normalized.length) {
      const breakPoints = ['\n\n', '\n', '. ', '! ', '? ', ' '];
      for (const bp of breakPoints) {
        const pos = normalized.lastIndexOf(bp, end);
        if (pos > start + CHUNK_SIZE / 2) {
          end = pos + bp.length;
          break;
        }
      }
    } else {
      end = normalized.length;
    }

    const content = normalized.slice(start, end).trim();
    if (content) {
      chunks.push({ content, chunkIndex: index++ });
    }

    start = end - CHUNK_OVERLAP;
    if (start >= normalized.length) break;
  }

  return chunks;
};

module.exports = chunkText;
