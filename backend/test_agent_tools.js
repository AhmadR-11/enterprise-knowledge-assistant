// backend/test_agent_tools.js
// Verification suite for Agentic Tool Calling, Zod validation, and SSE event ordering

const EventEmitter = require('events');
const { executeTool, toolsRegistry, getGeminiFunctionDeclarations } = require('./src/tools');
const { runAgentStream, buildPrompt } = require('./src/services/llm.service');
const { handleChatStream } = require('./src/controllers/chat.controller');

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
  console.log('🧪 Starting Agentic Tool Calling & SSE Suite...\n');

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
  // Too short query (<2)
  const inv1 = await executeTool('searchKnowledgeBase', { query: 'x' }, {});
  assert('Too short query returns VALIDATION_ERROR', inv1.error === 'VALIDATION_ERROR');
  assert('Details mention minimum 2 characters', inv1.details.some(d => d.includes('2 characters')));

  // topK out of range (>8)
  const inv2 = await executeTool('searchKnowledgeBase', { query: 'valid query', topK: 99 }, {});
  assert('Out of range topK returns VALIDATION_ERROR', inv2.error === 'VALIDATION_ERROR');

  // Missing documentId for getDocumentDetails
  const inv3 = await executeTool('getDocumentDetails', {}, { user: { id: 1, role: 'admin' } });
  assert('Missing documentId returns VALIDATION_ERROR', inv3.error === 'VALIDATION_ERROR');

  // Unknown tool
  const inv4 = await executeTool('executeTerminalCommand', { cmd: 'rm -rf' }, {});
  assert('Unregistered tool returns TOOL_NOT_FOUND', inv4.error === 'TOOL_NOT_FOUND');

  // ── TEST 3: RBAC Access Control on Document Details ──
  console.log('\n── Test 3: RBAC Access Control on Document Details ──');
  // Viewer asking for document in unassigned space
  const userSpaceModel = require('./src/models/postgres/userSpace.model');
  const originalListSpaces = userSpaceModel.listSpacesForUser;
  // Mock viewer assigned only to space 3
  userSpaceModel.listSpacesForUser = async () => [3];

  const Document = require('./src/models/mongo/Document.model');
  const originalFindById = Document.findById;
  // Mock document residing in space 99 (finance / secret space)
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

  // Restore mocks
  userSpaceModel.listSpacesForUser = originalListSpaces;
  Document.findById = originalFindById;

  // ── TEST 4: Full End-to-End Event Ordering (tool_start -> tool_end -> token -> sources -> done) ──
  console.log('\n── Test 4: SSE Event Order Verification (tool_start -> tool_end -> token -> sources -> done) ──');
  {
    process.env.USE_TOOL_CALLING = 'true';
    const llmService = require('./src/services/llm.service');
    const originalRunAgent = llmService.runAgentStream;

    // Stub runAgentStream to simulate exact tool calling events
    llmService.runAgentStream = async ({ question, userContext, callbacks }) => {
      // 1. Tool start
      callbacks.onToolStart({
        id: 'call_test_123',
        name: 'searchKnowledgeBase',
        argsSummary: 'query: "transformer architecture" (topK: 5)'
      });

      // 2. Tool end
      callbacks.onToolEnd({
        id: 'call_test_123',
        name: 'searchKnowledgeBase',
        durationMs: 85,
        resultCount: 2,
        ok: true
      });

      // 3. Tokens streaming
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

    assert('First event is tool_start', eventNames[0] === 'tool_start');
    assert('Second event is tool_end', eventNames[1] === 'tool_end');
    assert('Third event is token', eventNames[2] === 'token');
    assert('Penultimate event is sources', eventNames[eventNames.length - 2] === 'sources');
    assert('Final event is done', eventNames[eventNames.length - 1] === 'done');

    // Check payload contents
    const startEvent = res.writtenEvents.find(e => e.event === 'tool_start');
    assert('tool_start payload has name and argsSummary', startEvent.data.name === 'searchKnowledgeBase' && !!startEvent.data.argsSummary);

    const endEvent = res.writtenEvents.find(e => e.event === 'tool_end');
    assert('tool_end payload has durationMs and ok: true', endEvent.data.ok === true && typeof endEvent.data.durationMs === 'number');

    const sourcesEvent = res.writtenEvents.find(e => e.event === 'sources');
    assert('sources payload has array of sources with score', Array.isArray(sourcesEvent.data) && sourcesEvent.data[0].score === 0.88);

    llmService.runAgentStream = originalRunAgent;
  }

  // ── TEST 5: General Greeting (NO tool triggered) ──
  console.log('\n── Test 5: General Greeting Flow (NO tools triggered) ──');
  {
    process.env.USE_TOOL_CALLING = 'true';
    const llmService = require('./src/services/llm.service');
    const originalRunAgent = llmService.runAgentStream;

    llmService.runAgentStream = async ({ callbacks }) => {
      // Direct token streaming without any tool calls
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
    assert('NO tool_start event emitted for greeting', !eventNames.includes('tool_start'));
    assert('NO tool_end event emitted for greeting', !eventNames.includes('tool_end'));
    assert('Emits token directly', eventNames.includes('token'));
    assert('Emits done event', eventNames.includes('done'));

    llmService.runAgentStream = originalRunAgent;
  }

  // ── TEST 6: Abort Mid-Tool-Loop ──
  console.log('\n── Test 6: Abort Mid-Tool-Loop (Cancellation Safety) ──');
  {
    process.env.USE_TOOL_CALLING = 'true';
    const llmService = require('./src/services/llm.service');
    const originalRunAgent = llmService.runAgentStream;

    let abortedCaught = false;
    llmService.runAgentStream = async ({ options, callbacks }) => {
      callbacks.onToolStart({ id: 'call_aborted', name: 'searchKnowledgeBase', argsSummary: 'q: "test"' });
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          abortedCaught = true;
        });
      }
      // Wait for simulated disconnect
      await new Promise(r => setTimeout(r, 30));
      return { finishReason: 'CANCELLED', usage: null, sources: [] };
    };

    const { req, res } = createMockReqRes({
      body: { question: 'Search knowledge base' }
    });

    // Simulate client abort right after connection
    setTimeout(() => {
      req.emit('close');
    }, 10);

    await handleChatStream(req, res);

    assert('Signal caught abort on client disconnect', abortedCaught === true);

    llmService.runAgentStream = originalRunAgent;
  }

  // ── TEST 7: Backward Compatibility Fallback (USE_TOOL_CALLING=false) ──
  console.log('\n── Test 7: Fallback to Static RAG when USE_TOOL_CALLING=false ──');
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
    llmService.generateAnswerStream = async () => ({
      stream: (async function* () {
        yield { text: () => 'Static answer' };
      })(),
      response: Promise.resolve({ candidates: [{ finishReason: 'STOP' }] })
    });

    const { req, res } = createMockReqRes({
      body: { question: 'Fallback question' }
    });

    await handleChatStream(req, res);

    const eventNames = res.writtenEvents.map(e => e.event);
    assert('Fallback does NOT emit tool_start', !eventNames.includes('tool_start'));
    assert('Fallback emits token', eventNames.includes('token'));
    assert('Fallback emits done event with static sources', eventNames.includes('done'));

    retrievalService.retrieveContext = originalRetrieve;
    llmService.generateAnswerStream = originalGenerateStream;
    process.env.USE_TOOL_CALLING = 'true';
  }

  console.log(`\n======================================================`);
  console.log(`Agentic Tools Suite Results: ${passed} passed, ${failed} failed`);
  console.log(`======================================================\n`);

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
