// backend/src/config/gemini.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('⚠️ Warning: GEMINI_API_KEY is not defined in the environment.');
}

const genAI = new GoogleGenerativeAI(apiKey || 'dummy-key');

module.exports = genAI;
