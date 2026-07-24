// backend/src/services/llm.service.js
const genAI = require('../config/gemini');

const generateAnswer = async (question, contextText) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
You are an Enterprise AI Knowledge Assistant. Answer the user's question accurately using ONLY the provided context excerpts from indexed documents within the user's authorized spaces.

Context Excerpts:
---
${contextText || 'No context available.'}
---

User Question: ${question}

Instructions:
1. Provide a clear, structured, and helpful answer.
2. Rely strictly on the context provided above.
3. If the information is not present in the excerpts, politely explain that the available space documents do not contain an answer to this question.
`;

  const response = await model.generateContent(prompt);
  return response.response.text();
};

module.exports = { generateAnswer };
