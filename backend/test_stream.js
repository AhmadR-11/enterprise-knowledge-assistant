// backend/test_stream.js
// Automated verification for the streaming endpoint implementation

const EventEmitter = require('events');
const { sendEvent, resolveChatAccess, handleChatStream, handleChatQuery } = require('./src/controllers/chat.controller');
const { buildPrompt } = require('./src/services/llm.service');

// Helper to create mock Express request and response objects
function createMockReqRes(options = {}) {
  const req = new EventEmitter();
  req.headers = options.headers || {};
  req.body = options.body || {};
  req.user = options.user || { id: 1, email: 'admin@company.com', role: 'admin' };
  req.destroyed = false;

  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.writtenData = '';
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
    this.writtenData += chunk;
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

async function runTests() {
  console.log('🧪 Starting Streaming Endpoint Test Suite...\n');

  // ── TEST 1: sendEvent formatting ─────────────────────────────────────────
  console.log('── Test 1: SSE sendEvent Protocol Formatting ──');
  {
    const { res } = createMockReqRes();
    sendEvent(res, 'token', { text: 'Hello world' });
    sendEvent(res, 'done', { finishReason: 'STOP', usage: { totalTokens: 42 } });

    assert(
      'Formats token event correctly',
      res.writtenData.includes('event: token\ndata: {"text":"Hello world"}\n\n')
    );
    assert(
      'Formats done event correctly',
      res.writtenData.includes('event: done\ndata: {"finishReason":"STOP","usage":{"totalTokens":42}}\n\n')
    );
  }

  // ── TEST 2: Prompt Builder ──────────────────────────────────────────────
  console.log('\n── Test 2: Shared Prompt Builder ──');
  {
    const prompt = buildPrompt('What is the refund policy?', 'Excerpts: 30-day refund window.');
    assert('Prompt contains question', prompt.includes('What is the refund policy?'));
    assert('Prompt contains context', prompt.includes('30-day refund window.'));
    assert('Prompt contains instructions', prompt.includes('Rely strictly on the context provided above.'));
  }

  // ── TEST 3: Validation Error Before First Token ──────────────────────────
  console.log('\n── Test 3: Validation Error Handling (Bad Input) ──');
  {
    const { req, res } = createMockReqRes({ body: { question: '   ' } });
    await handleChatStream(req, res);

    assert('Response status is 200 with SSE headers', res.statusCode === 200 && res.headers['Content-Type'] === 'text/event-stream');
    assert('Headers were flushed immediately', res.headersFlushed === true);
    assert('Emits BAD_REQUEST error event', res.writtenData.includes('event: error\ndata: {"code":"BAD_REQUEST","message":"Question is required"}\n\n'));
    assert('Response stream ended', res.writableEnded === true);
  }

  // ── TEST 4: Space Access Authorization Check ────────────────────────────
  console.log('\n── Test 4: Role-Based Space Authorization Filter ──');
  {
    const userSpacesModel = require('./src/models/postgres/userSpace.model');
    const originalListSpaces = userSpacesModel.listSpacesForUser;
    userSpacesModel.listSpacesForUser = async () => [];

    const { req, res } = createMockReqRes({
      user: { id: 2, email: 'viewer@company.com', role: 'viewer' },
      body: { question: 'Tell me about the project' }
    });

    await handleChatStream(req, res);

    assert('Emits FORBIDDEN error event for unassigned user', res.writtenData.includes('event: error\ndata: {"code":"FORBIDDEN","message":"Access Denied: You are not currently assigned to any space"}\n\n'));
    assert('Response stream ended', res.writableEnded === true);

    userSpacesModel.listSpacesForUser = originalListSpaces;
  }

  // ── TEST 5: Normal Answer Stream (token -> done) ─────────────────────────
  console.log('\n── Test 5: Full Streaming Flow (token -> done) ──');
  {
    const auditService = require('./src/services/audit.service');
    const originalLogAuth = auditService.logAuthAttempt;
    auditService.logAuthAttempt = async () => {};

    const retrievalService = require('./src/services/retrieval.service');
    const originalRetrieve = retrievalService.retrieveContext;
    retrievalService.retrieveContext = async () => ({
      contextText: 'Company vacation policy is 20 days per year.',
      sources: [{ documentTitle: 'Employee Handbook.pdf', pageNumber: 4, similarity: 0.92 }]
    });

    const llmService = require('./src/services/llm.service');
    const originalGenerateStream = llmService.generateAnswerStream;
    llmService.generateAnswerStream = async function (q, ctx, opts) {
      return {
        stream: (async function* () {
          yield { text: () => 'The company ' };
          yield { text: () => 'offers 20 days ' };
          yield { text: () => 'of vacation.' };
        })(),
        response: Promise.resolve({
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 8, totalTokenCount: 23 }
        })
      };
    };

    const { req, res } = createMockReqRes({
      body: { question: 'How many vacation days do I get?' }
    });

    await handleChatStream(req, res);

    assert('Contains first token', res.writtenData.includes('event: token\ndata: {"text":"The company "}\n\n'));
    assert('Contains second token', res.writtenData.includes('event: token\ndata: {"text":"offers 20 days "}\n\n'));
    assert('Contains third token', res.writtenData.includes('event: token\ndata: {"text":"of vacation."}\n\n'));
    assert('Contains done event with finishReason and usage', res.writtenData.includes('"finishReason":"STOP"'));
    assert('Contains done event with usage stats', res.writtenData.includes('"totalTokens":23'));
    assert('Contains sources in done payload', res.writtenData.includes('Employee Handbook.pdf'));
    assert('Response stream closed properly', res.writableEnded === true);

    retrievalService.retrieveContext = originalRetrieve;
    llmService.generateAnswerStream = originalGenerateStream;
    auditService.logAuthAttempt = originalLogAuth;
  }

  // ── TEST 6: Client Disconnect Mid-Stream (req.on('close')) ────────────────
  console.log('\n── Test 6: Client Disconnect Mid-Stream Abort Handling ──');
  {
    const retrievalService = require('./src/services/retrieval.service');
    const originalRetrieve = retrievalService.retrieveContext;
    retrievalService.retrieveContext = async () => ({ contextText: 'Some context', sources: [] });

    let aborted = false;
    const llmService = require('./src/services/llm.service');
    const originalGenerateStream = llmService.generateAnswerStream;
    llmService.generateAnswerStream = async (q, ctx, opts) => {
      if (opts.signal) {
        opts.signal.addEventListener('abort', () => {
          aborted = true;
        });
      }
      return {
        stream: (async function* () {
          yield { text: () => 'Chunk 1' };
          // Simulate client disconnect right after chunk 1
          req.emit('close');
          yield { text: () => 'Chunk 2' };
        })(),
        response: Promise.resolve({ candidates: [{ finishReason: 'STOP' }] })
      };
    };

    const { req, res } = createMockReqRes({
      body: { question: 'What is happening?' }
    });

    // Capture console.log
    let loggedDisconnect = false;
    const originalConsoleLog = console.log;
    console.log = (...args) => {
      if (args.join(' ').includes('client disconnected, generation cancelled')) {
        loggedDisconnect = true;
      }
      originalConsoleLog(...args);
    };

    await handleChatStream(req, res);

    console.log = originalConsoleLog;

    assert('Signal was aborted on client close', aborted === true);
    assert('Logged concise "client disconnected, generation cancelled"', loggedDisconnect === true);
    assert('Wrote chunk 1 before disconnect', res.writtenData.includes('Chunk 1'));
    assert('Did NOT write chunk 2 after disconnect', !res.writtenData.includes('Chunk 2'));

    retrievalService.retrieveContext = originalRetrieve;
    llmService.generateAnswerStream = originalGenerateStream;
  }

  // ── TEST 7: Upstream Error Handling (Safe Error Event) ──────────────────
  console.log('\n── Test 7: Upstream Error Handling (No Secret Leaks) ──');
  {
    const retrievalService = require('./src/services/retrieval.service');
    const originalRetrieve = retrievalService.retrieveContext;
    retrievalService.retrieveContext = async () => ({ contextText: '', sources: [] });

    const llmService = require('./src/services/llm.service');
    const originalGenerateStream = llmService.generateAnswerStream;
    llmService.generateAnswerStream = async () => {
      const err = new Error('Secret upstream failure with sk-proj-123456');
      err.stack = 'Secret stack trace at line 99';
      throw err;
    };

    const { req, res } = createMockReqRes({
      body: { question: 'Trigger an upstream error' }
    });

    await handleChatStream(req, res);

    assert('Emits UPSTREAM_ERROR event', res.writtenData.includes('event: error\ndata: {"code":"UPSTREAM_ERROR","message":"An unexpected error occurred while generating the answer."}\n\n'));
    assert('Does not leak secret API key or stack trace', !res.writtenData.includes('sk-proj') && !res.writtenData.includes('stack trace'));
    assert('Response closed on error', res.writableEnded === true);

    retrievalService.retrieveContext = originalRetrieve;
    llmService.generateAnswerStream = originalGenerateStream;
  }

  // ── TEST 8: Existing POST /api/chat Non-Streaming Endpoint ───────────────
  console.log('\n── Test 8: Backward Compatibility with POST /api/chat ──');
  {
    const retrievalService = require('./src/services/retrieval.service');
    const originalRetrieve = retrievalService.retrieveContext;
    retrievalService.retrieveContext = async () => ({
      contextText: 'Synchronous context data.',
      sources: [{ documentTitle: 'Doc1.pdf', pageNumber: 1, similarity: 0.88 }]
    });

    const llmService = require('./src/services/llm.service');
    const originalGenerate = llmService.generateAnswer;
    llmService.generateAnswer = async () => 'Synchronous full answer';

    let jsonResponse = null;
    const req = {
      user: { id: 1, email: 'admin@company.com', role: 'admin' },
      body: { question: 'Non-streaming test' }
    };
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(data) { jsonResponse = data; return this; }
    };

    await handleChatQuery(req, res, () => {});

    assert('Existing endpoint returns success true', jsonResponse?.success === true);
    assert('Existing endpoint returns answer', jsonResponse?.data?.answer === 'Synchronous full answer');
    assert('Existing endpoint returns sources', jsonResponse?.data?.sources?.length === 1);

    retrievalService.retrieveContext = originalRetrieve;
    llmService.generateAnswer = originalGenerate;
  }

  console.log('\n======================================================');
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
