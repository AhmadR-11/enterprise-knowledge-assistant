// backend/src/utils/extractText.js
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Extract plain text from an uploaded file buffer
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string>} Extracted plain text
 */
const extractText = async (buffer, mimeType) => {
  if (mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
    return buffer.toString('utf-8');
  }

  throw new Error(`Unsupported file type: ${mimeType}`);
};

module.exports = extractText;
