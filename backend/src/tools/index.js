// backend/src/tools/index.js
const searchKnowledgeBaseTool = require('./searchKnowledgeBase.tool');
const getDocumentDetailsTool = require('./getDocumentDetails.tool');

/**
 * Registry of available agentic tools.
 */
const toolsRegistry = {
  [searchKnowledgeBaseTool.name]: searchKnowledgeBaseTool,
  [getDocumentDetailsTool.name]: getDocumentDetailsTool
};

/**
 * Returns Gemini OpenAPI function declarations for all registered tools.
 * Strips any internal keys so only valid Gemini function declaration fields are passed.
 * @returns {Array<Object>}
 */
const getGeminiFunctionDeclarations = () => {
  return Object.values(toolsRegistry).map((tool) => ({
    name: tool.declaration.name,
    description: tool.declaration.description,
    parameters: tool.declaration.parameters
  }));
};

/**
 * Validates and executes a tool safely.
 * Never throws an uncaught error back to the caller; returns structured errors instead.
 * @param {string} name - Tool name
 * @param {Object} rawArgs - Raw arguments provided by the LLM
 * @param {Object} userContext - Context containing authenticated user and space restrictions
 * @returns {Promise<Object>} Execution result or structured error
 */
const executeTool = async (name, rawArgs, userContext) => {
  const tool = toolsRegistry[name];

  if (!tool) {
    return {
      error: 'TOOL_NOT_FOUND',
      message: `Tool "${name}" is not registered in the system.`
    };
  }

  // 1. Zod Argument Validation
  const validation = tool.schema.safeParse(rawArgs || {});
  if (!validation.success) {
    const errorDetails = validation.error.issues.map(
      (issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`
    );
    return {
      error: 'VALIDATION_ERROR',
      message: 'Invalid arguments provided for tool execution.',
      details: errorDetails
    };
  }

  // 2. Safe Tool Execution
  try {
    return await tool.execute(validation.data, userContext);
  } catch (err) {
    console.error(`[Tool Execution Error] ${name}:`, err.message);
    return {
      error: 'EXECUTION_ERROR',
      message: err.message || 'An unexpected error occurred during tool execution.'
    };
  }
};

module.exports = {
  toolsRegistry,
  getGeminiFunctionDeclarations,
  executeTool
};

