// backend/test_agent_tools.js
// Verification suite for Agentic Tool Calling, Zod validation, SSE event ordering, and Chat Persistence

const EventEmitter = require('events');
const { executeTool, toolsRegistry, getGeminiFunctionDeclarations } = require('./src/tools');
const { runAgentStream, buildPrompt } = require('./src/services/llm.service');
const { handleChatStream } = require('./src/controllers/chat.controller');
const conversationService = require('./src/services/conversation.service');
const conversationModel = require('./src/models/postgres/conversation.model');
const messageModel = require('./src/models/postgres/message.model');

// In-memory test store for conversations and messages
const inMemoryConversations = new Map();
const inMemoryMessages = [];

// Wire in-memory mock implementations to models for isolation
conversationModel.createConversation = async (userId, title) => {
  const id = `conv-uuid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const record = { id, user_id: userId, title, created_at: new Date(), updated_at: new Date() };
  inMemoryConversations.set(id, record);
  return record;
};

conversationModel.findConversationById = async (id, userId) => {
  const record = inMemoryConversations.get(id);
  if (!record || record.user_id !== userId) return null;
  return record;
};

conversationModel.listConversationsByUserId = async (userId, { limit = 30, offset = 0 } = {}) => {
  const userConvs = [...inMemoryConversations.values()]
    .filter((c) => c.user_id === userId)
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(offset, offset + limit);
  return userConvs;
};

conversationModel.countConversationsByUserId = async (userId) => {
  return [...inMemoryConversations.values()].filter((c) => c.user_id === userId).length;
};

conversationModel.updateConversationTitle = async (id, userId, title) => {
  const record = inMemoryConversations.get(id);
  if (!record || record.user_id !== userId) return null;
  record.title = title;
  record.updated_at = new Date();
  return record;
};

conversationModel.touchConversation = async (id) => {
  const record = inMemoryConversations.get(id);
  if (record) record.updated_at = new Date();
};

conversationModel.deleteConversation = async (id, userId) => {
  const record = inMemoryConversations.get(id);
  if (!record || record.user_id !== userId) return null;
  inMemoryConversations.delete(id);
  // Cascade delete messages
  for (let i = inMemoryMessages.length - 1; i >= 0; i--) {
    if (inMemoryMessages[i].conversation_id === id) {
      inMemoryMessages.splice(i, 1);
    }
  }
  return { id };
};

messageModel.createMessage = async ({
  conversationId,
  role,
  content,
  status = 'complete',
  sources = [],
  toolActivity = [],
  errorMessage = null
}) => {
  const id = `msg-uuid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const record = {
    id,
    conversation_id: conversationId,
    role,
    content,
    status,
    sources,
    tool_activity: toolActivity,
    error_message: errorMessage,
    created_at: new Date()
  };
  inMemoryMessages.push(record);
  return record;
};

messageModel.listMessagesByConversationId = async (conversationId) => {
  return inMemoryMessages
    .filter((m) => m.conversation_id === conversationId)
    .sort((a, b) => a.created_at - b.created_at);
};

messageModel.getLastCompleteMessages = async (conversationId, limit = 10) => {
  const completes = inMemoryMessages
    .filter((m) => m.conversation_id === conversationId && m.status === 'complete')
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit);
  return completes.reverse();
};

function createMockReqRes(options = {}) {
  const req = new EventEmitter();
  req.headers = options.headers || {};
  req.body = options.body || {};
  req.user = options.user || { id: 7, email: 'admin@company.com', role: 'admin' };
  req.destroyed = false;

  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.writtenEvents = [];
  res.rawOutput = '';
  res.writableEnded = false;
  res.writable = true;

  res.writeHead = function(status, headers) {
    this.statusCode = status;
    this.headers = headers;
  };
  res.flushHeaders = function() {
    this.headersFlushed = true;
  };
  res.write = function(chunk) {
    if (this.writableEnded) {
      throw new Error('ERR_STREAM_WRITE_AFTER_END: Attempted write after end');
    }
    this.rawOutput += chunk;

    // Parse SSE lines
    const blocks = chunk.split(/\n\n/);
    for (const b of blocks) {
      if (!b.trim()) continue;
      const lines = b.split(/\n/);
      let event = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) data = line.slice(5).trim();
      }
      try {
        res.writtenEvents.push({ event, data: JSON.parse(data) });
      } catch {
        res.writtenEvents.push({ event, raw: data });
      }
    }
    return true;
  };
  res.end = function() {
    this.writableEnded = true;
    this.writable = false;
    this.emit('close');
  };

  return { req, res };
}

let passed = 0;
let failed = 0;

function assert(description, condition) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

async function runAllTests() {
  console.log('🧪 Starting Agentic Tool Calling, SSE & Chat Persistence Suite...\n');

  // ── TEST 1: Tool Registry & Gemini Declarations ──
  console.log('── Test 1: Tool Registry & Gemini Declarations ──');
  const declarations = getGeminiFunctionDeclarations();
  assert('Exports searchKnowledgeBase tool', !!toolsRegistry.searchKnowledgeBase);
  assert('Exports getDocumentDetails tool', !!toolsRegistry.getDocumentDetails);
  assert('Declarations count equals 2', declarations.length === 2);
  const searchDecl = declarations.find(d => d.name === 'searchKnowledgeBase');
  assert('searchKnowledgeBase parameters have required "query"', searchDecl.parameters.required.includes('query'));
  assert('searchKnowledgeBase strips internal $schema keys', !('$schema' in searchDecl.parameters));

  // ── TEST 2: Invalid Arguments from Model (Zod Safe Validation) ──
  console.log('\n── Test 2: Invalid Arguments from Model (Zod Validation) ──');
  const inv1 = await executeTool('searchKnowledgeBase', { query: 'x' }, {});
  assert('Too short query returns VALIDATION_ERROR', inv1.error === 'VALIDATION_ERROR');
  assert('Details mention minimum 2 characters', inv1.details.some(d => d.includes('2 characters')));

  const inv2 = await executeTool('searchKnowledgeBase', { query: 'valid query', topK: 99 }, {});
  assert('Out of range topK returns VALIDATION_ERROR', inv2.error === 'VALIDATION_ERROR');

  const inv3 = await executeTool('getDocumentDetails', {}, { user: { id: 1, role: 'admin' } });
  assert('Missing documentId returns VALIDATION_ERROR', inv3.error === 'VALIDATION_ERROR');

  const inv4 = await executeTool('executeTerminalCommand', { cmd: 'rm -rf' }, {});
  assert('Unregistered tool returns TOOL_NOT_FOUND', inv4.error === 'TOOL_NOT_FOUND');

  // ── TEST 3: RBAC Access Control on Document Details ──
  console.log('\n── Test 3: RBAC Access Control on Document Details ──');
  const userSpaceModel = require('./src/models/postgres/userSpace.model');
  const originalListSpaces = userSpaceModel.listSpacesForUser;
  userSpaceModel.listSpacesForUser = async () => [3];

  const Document = require('./src/models/mongo/Document.model');
  const originalFindById = Document.findById;
  Document.findById = (id) => ({
    lean: async () => ({
      _id: '507f1f77bcf86cd799439011',
      title: 'Secret Executive Compensation.pdf',
      spaceId: 99,
      mimeType: 'application/pdf',
      status: 'ready'
    })
  });

  const deniedViewerResult = await executeTool(
    'getDocumentDetails',
    { documentId: '507f1f77bcf86cd799439011' },
    { user: { id: 9, role: 'viewer' }, targetSpaceIds: [3] }
  );

  assert('Viewer is denied access to document in space 99', deniedViewerResult.error === 'NOT_FOUND');
  assert('Error message does NOT leak document existence', deniedViewerResult.message === 'Document not found or access denied');
  assert('Does NOT return document title or content', !deniedViewerResult.title);

  userSpaceModel.listSpacesForUser = originalListSpaces;
  Document.findById = originalFindById;

  // ── TEST 4: Full End-to-End SSE Event Order Verification with Conversation ──
  console.log('\n── Test 4: SSE Event Order Verification (conversation -> tool_start -> tool_end -> token -> sources -> done) ──');
  let test4ConvId = null;
  {
    process.env.USE_TOOL_CALLING = 'true';
    const llmService = require('./src/services/llm.service');
    const originalRunAgent = llmService.runAgentStream;

    llmService.runAgentStream = async ({ question, userContext, callbacks }) => {
      callbacks.onToolStart({
        id: 'call_test_123',
        name: 'searchKnowledgeBase',
        argsSummary: 'query: "transformer architecture" (topK: 5)'
      });

      callbacks.onToolEnd({
        id: 'call_test_123',
        name: 'searchKnowledgeBase',
        durationMs: 85,
        resultCount: 2,
        ok: true
      });

      callbacks.onToken('The Transformer architecture is based entirely on attention mechanisms.');
      callbacks.onToken(' It removes all recurrent and convolutional layers.');

      return {
        finishReason: 'STOP',
        usage: { promptTokens: 450, completionTokens: 25, totalTokens: 475 },
        sources: [
          { documentId: 'doc_1', title: 'Attention Is All You Need', pageNumber: 1, score: 0.88 }
        ]
      };
    };

    const { req, res } = createMockReqRes({
      body: { question: 'Explain the transformer architecture' }
    });

    await handleChatStream(req, res);

    const eventNames = res.writtenEvents.map(e => e.event);
    console.log('  Emitted events:', eventNames);

    assert('First event is conversation', eventNames[0] === 'conversation');
    assert('Second event is tool_start', eventNames[1] === 'tool_start');
    assert('Third event is tool_end', eventNames[2] === 'tool_end');
    assert('Fourth event is token', eventNames[3] === 'token');
    assert('Penultimate event is sources', eventNames[eventNames.length - 2] === 'sources');
    assert('Final event is done', eventNames[eventNames.length - 1] === 'done');

    const convEvent = res.writtenEvents.find(e => e.event === 'conversation');
    assert('conversation payload has id and title', !!convEvent.data.id && typeof convEvent.data.title === 'string');
    test4ConvId = convEvent.data.id;

    const startEvent = res.writtenEvents.find(e => e.event === 'tool_start');
    assert('tool_start payload has name and argsSummary', startEvent.data.name === 'searchKnowledgeBase' && !!startEvent.data.argsSummary);

    const endEvent = res.writtenEvents.find(e => e.event === 'tool_end');
    assert('tool_end payload has durationMs and ok: true', endEvent.data.ok === true && typeof endEvent.data.durationMs === 'number');

    const sourcesEvent = res.writtenEvents.find(e => e.event === 'sources');
    assert('sources payload has array of sources with score', Array.isArray(sourcesEvent.data) && sourcesEvent.data[0].score === 0.88);

    llmService.runAgentStream = originalRunAgent;
  }

  // ── TEST 5: Conversation Persistence in DB (User message & Assistant message saved) ──
  console.log('\n── Test 5: Verify Saved Conversation Messages in PostgreSQL ──');
  {
    const { conversation, messages } = await conversationService.getConversationMessages(test4ConvId, 7);
    assert('Conversation exists with correct title', !!conversation && conversation.title.includes('Explain the transformer'));
    assert('Both user and assistant messages were saved (count = 2)', messages.length === 2);
    assert('User message role is "user"', messages[0].role === 'user');
    assert('User message status is "complete"', messages[0].status === 'complete');
    assert('Assistant message role is "assistant"', messages[1].role === 'assistant');
    assert('Assistant message status is "complete"', messages[1].status === 'complete');
    assert('Assistant message content preserved tokens', messages[1].content.includes('Transformer architecture'));
    assert('Assistant message saved sources', messages[1].sources.length === 1 && messages[1].sources[0].title === 'Attention Is All You Need');
    assert('Assistant message saved tool activities', messages[1].toolActivity.length === 1 && messages[1].toolActivity[0].name === 'searchKnowledgeBase');
  }

  // ── TEST 6: General Greeting Flow (NO tools triggered) ──
  console.log('\n── Test 6: General Greeting Flow (NO tools triggered) ──');
  {
    process.env.USE_TOOL_CALLING = 'true';
    const llmService = require('./src/services/llm.service');
    const originalRunAgent = llmService.runAgentStream;

    llmService.runAgentStream = async ({ callbacks }) => {
      callbacks.onToken('Hello! How can I assist you with your enterprise documents today?');
      return {
        finishReason: 'STOP',
        usage: { promptTokens: 120, completionTokens: 15, totalTokens: 135 },
        sources: []
      };
    };

    const { req, res } = createMockReqRes({
      body: { question: 'Hello!' }
    });

    await handleChatStream(req, res);

    const eventNames = res.writtenEvents.map(e => e.event);
    assert('First event is conversation', eventNames[0] === 'conversation');
    assert('NO tool_start event emitted for greeting', !eventNames.includes('tool_start'));
    assert('NO tool_end event emitted for greeting', !eventNames.includes('tool_end'));
    assert('Emits token directly', eventNames.includes('token'));
    assert('Emits done event', eventNames.includes('done'));

    llmService.runAgentStream = originalRunAgent;
  }

  // ── TEST 7: Abort Mid-Stream (Saves Partial Text with status 'stopped') ──
  console.log('\n── Test 7: Abort Mid-Stream Saves Partial Text with status "stopped" ──');
  {
    process.env.USE_TOOL_CALLING = 'true';
    const llmService = require('./src/services/llm.service');
    const originalRunAgent = llmService.runAgentStream;

    let abortedCaught = false;
    llmService.runAgentStream = async ({ options, callbacks }) => {
      callbacks.onToolStart({ id: 'call_aborted', name: 'searchKnowledgeBase', argsSummary: 'q: "test"' });
      callbacks.onToken('Partial content before stop');
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          abortedCaught = true;
        });
      }
      await new Promise(r => setTimeout(r, 40));
      return { finishReason: 'CANCELLED', usage: null, sources: [] };
    };

    const { req, res } = createMockReqRes({
      body: { question: 'Generate long analysis of all systems' }
    });

    // Simulate client abort right after tokens start
    setTimeout(() => {
      req.emit('close');
    }, 15);

    await handleChatStream(req, res);

    assert('Signal caught abort on client disconnect', abortedCaught === true);

    const convEvent = res.writtenEvents.find(e => e.event === 'conversation');
    const { messages } = await conversationService.getConversationMessages(convEvent.data.id, 7);
    const stoppedMsg = messages.find(m => m.role === 'assistant');
    assert('Stopped assistant message has status "stopped"', stoppedMsg && stoppedMsg.status === 'stopped');
    assert('Stopped assistant message preserved partial content', stoppedMsg && stoppedMsg.content.includes('Partial content'));
    assert('Interrupted tool activity status marked as "failed"', stoppedMsg && stoppedMsg.toolActivity[0].status === 'failed');

    llmService.runAgentStream = originalRunAgent;
  }

  // ── TEST 8: Error Path Saves status 'error' and Safe Error Message ──
  console.log('\n── Test 8: Error Path Saves status "error" and Safe Error Message ──');
  {
    process.env.USE_TOOL_CALLING = 'true';
    const llmService = require('./src/services/llm.service');
    const originalRunAgent = llmService.runAgentStream;

    llmService.runAgentStream = async ({ callbacks }) => {
      callbacks.onToken('Initial chunk...');
      const err = new Error('Gemini API quota exceeded');
      err.status = 429;
      throw err;
    };

    const { req, res } = createMockReqRes({
      body: { question: 'Will fail due to rate limit' }
    });

    await handleChatStream(req, res);

    const convEvent = res.writtenEvents.find(e => e.event === 'conversation');
    const errorEvent = res.writtenEvents.find(e => e.event === 'error');
    assert('Error event emitted to client', !!errorEvent);
    assert('Error message is sanitized (no stack trace leaked)', errorEvent.data.message.includes('Rate limit'));

    const { messages } = await conversationService.getConversationMessages(convEvent.data.id, 7);
    const errorMsg = messages.find(m => m.role === 'assistant');
    assert('Assistant message saved with status "error"', errorMsg && errorMsg.status === 'error');
    assert('Assistant message saved safe error message', errorMsg && errorMsg.errorMessage.includes('Rate limit'));
    assert('Assistant message preserved partial text before crash', errorMsg && errorMsg.content.includes('Initial chunk'));

    llmService.runAgentStream = originalRunAgent;
  }

  // ── TEST 9: Follow-up Question Loads Previous Context History (Last 10 complete) ──
  console.log('\n── Test 9: Follow-up Question Passes History to Model ──');
  {
    const llmService = require('./src/services/llm.service');
    const originalRunAgent = llmService.runAgentStream;

    let receivedHistory = null;
    llmService.runAgentStream = async ({ question, history, callbacks }) => {
      receivedHistory = history;
      callbacks.onToken('Follow up answer based on history.');
      return { finishReason: 'STOP', usage: null, sources: [] };
    };

    const { req, res } = createMockReqRes({
      body: {
        question: 'What was my previous question about?',
        conversationId: test4ConvId
      }
    });

    await handleChatStream(req, res);

    assert('History was provided to LLM turn', Array.isArray(receivedHistory) && receivedHistory.length > 0);
    assert('History contains previous user prompt', receivedHistory.some(h => h.role === 'user' && h.content.includes('Explain the transformer')));
    assert('History contains previous assistant reply', receivedHistory.some(h => h.role === 'assistant' && h.content.includes('Transformer architecture')));

    llmService.runAgentStream = originalRunAgent;
  }

  // ── TEST 10: Multi-User RBAC Scoping (User B gets 404 for User A's conversation) ──
  console.log('\n── Test 10: Multi-User RBAC Scoping (User B receives 404 for User A conversation) ──');
  {
    // User 99 tries to load or stream into User 7's conversation
    const { req, res } = createMockReqRes({
      user: { id: 99, email: 'attacker@other.com', role: 'viewer' },
      body: {
        question: 'Sneak peek into user 7 conversation',
        conversationId: test4ConvId
      }
    });

    await handleChatStream(req, res);

    const errorEvent = res.writtenEvents.find(e => e.event === 'error');
    assert('Unauthorized user receives NOT_FOUND 404 error event', errorEvent && errorEvent.data.code === 'NOT_FOUND');
    assert('Error message does not reveal existence of conversation', errorEvent.data.message === 'Conversation not found');

    // Also verify REST endpoint returns 404
    let thrownError = null;
    try {
      await conversationService.getConversationMessages(test4ConvId, 99);
    } catch (e) {
      thrownError = e;
    }
    assert('Service layer throws 404 when user does not own conversation', thrownError && thrownError.status === 404);
  }

  // ── TEST 11: Rename & Delete Conversation with Cascade ──
  console.log('\n── Test 11: Rename and Delete Conversation (Cascade Message Removal) ──');
  {
    const renamed = await conversationService.renameConversation(test4ConvId, 7, 'Deep Learning Transformers');
    assert('Rename conversation updates title', renamed.title === 'Deep Learning Transformers');

    const deleteResult = await conversationService.deleteConversation(test4ConvId, 7);
    assert('Delete conversation succeeds', deleteResult && deleteResult.id === test4ConvId);

    // Messages should be cascade deleted
    const leftoverMessages = await messageModel.listMessagesByConversationId(test4ConvId);
    assert('Cascade delete removed all associated messages', leftoverMessages.length === 0);
  }

  // ── TEST 12: Backward Compatibility Fallback (USE_TOOL_CALLING=false) ──
  console.log('\n── Test 12: Fallback to Static RAG when USE_TOOL_CALLING=false ──');
  {
    process.env.USE_TOOL_CALLING = 'false';
    const retrievalService = require('./src/services/retrieval.service');
    const originalRetrieve = retrievalService.retrieveContext;
    retrievalService.retrieveContext = async () => ({
      contextText: 'Fallback static context',
      sources: [{ documentTitle: 'Fallback.pdf', pageNumber: 1, similarity: 0.9 }]
    });

    const llmService = require('./src/services/llm.service');
    const originalGenerateStream = llmService.generateAnswerStream;
    let fallbackReceivedHistory = null;
    llmService.generateAnswerStream = async (q, ctx, opts, hist) => {
      fallbackReceivedHistory = hist;
      return {
        stream: (async function* () {
          yield { text: () => 'Static answer' };
        })(),
        response: Promise.resolve({ candidates: [{ finishReason: 'STOP' }] })
      };
    };

    const { req, res } = createMockReqRes({
      body: { question: 'Fallback question' }
    });

    await handleChatStream(req, res);

    const eventNames = res.writtenEvents.map(e => e.event);
    assert('Fallback emits conversation event', eventNames.includes('conversation'));
    assert('Fallback does NOT emit tool_start', !eventNames.includes('tool_start'));
    assert('Fallback emits token', eventNames.includes('token'));
    assert('Fallback emits done event with static sources', eventNames.includes('done'));

    const convEvent = res.writtenEvents.find(e => e.event === 'conversation');
    const { messages } = await conversationService.getConversationMessages(convEvent.data.id, 7);
    assert('Static fallback persisted both user and assistant messages', messages.length === 2);
    assert('Static fallback assistant message status is "complete"', messages[1].status === 'complete');

    retrievalService.retrieveContext = originalRetrieve;
    llmService.generateAnswerStream = originalGenerateStream;
    process.env.USE_TOOL_CALLING = 'true';
  }

  // ─────────────────────────────────────────────────────────────
  // Test 13: Conversation Controller & Polymorphic apiResponse
  // ─────────────────────────────────────────────────────────────
  {
    console.log(`\n── Test 13: Conversation Controller & Polymorphic apiResponse ──`);
    const { successResponse } = require('./src/utils/apiResponse');
    const conversationController = require('./src/controllers/conversation.controller');

    function createMockRes() {
      return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
      };
    }

    // Direct polymorphic helper verification
    const r1 = createMockRes();
    successResponse(r1, 'Success', { conversations: [1, 2] });
    assert('Standard (res, message, data) sets message string', r1.body.message === 'Success');
    assert('Standard (res, message, data) sets data object', Array.isArray(r1.body.data.conversations));

    const r2 = createMockRes();
    successResponse(r2, { conversations: [1, 2] }, 'Success');
    assert('Inverted (res, data, message) sets message string', r2.body.message === 'Success');
    assert('Inverted (res, data, message) sets data object', Array.isArray(r2.body.data.conversations));

    // Controller verification
    const mockReq = { user: { id: 7 }, query: { page: 1, limit: 10 } };
    const mockControllerRes = createMockRes();
    await conversationController.getConversations(mockReq, mockControllerRes, () => {});

    assert('getConversations returns success: true', mockControllerRes.body.success === true);
    assert('getConversations returns message as human string', typeof mockControllerRes.body.message === 'string');
    assert('getConversations returns data containing conversations array', Array.isArray(mockControllerRes.body.data.conversations));
  }

  console.log(`\n======================================================`);
  console.log(`Agentic Tools & Persistence Suite Results: ${passed} passed, ${failed} failed`);
  console.log(`======================================================\n`);

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
