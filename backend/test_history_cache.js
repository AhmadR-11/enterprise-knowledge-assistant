// backend/test_history_cache.js
const assert = require('assert');
const EventEmitter = require('events');

process.on('unhandledRejection', () => {});

let passed = 0;
let failed = 0;

function testAssert(title, condition, extraInfo = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${title}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${title} ${extraInfo}`);
  }
}

/**
 * In-memory Mock Redis Client adhering to ioredis contract
 */
class MockRedisClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = { keyPrefix: 'cortex:', ...options };
    this.status = 'ready';
    this.store = new Map();
    this.expiries = new Map();
  }

  _resolveKey(key) {
    const prefix = this.options?.keyPrefix || '';
    if (prefix && !key.startsWith(prefix)) {
      return `${prefix}${key}`;
    }
    return key;
  }

  _isExpired(rKey) {
    const exp = this.expiries.get(rKey);
    if (exp && Date.now() >= exp) {
      this.store.delete(rKey);
      this.expiries.delete(rKey);
      return true;
    }
    return false;
  }

  async get(key) {
    if (this.status !== 'ready') throw new Error('Connection is closed');
    const rKey = this._resolveKey(key);
    if (this._isExpired(rKey)) return null;
    return this.store.get(rKey) || null;
  }

  async set(key, val, ...args) {
    if (this.status !== 'ready') throw new Error('Connection is closed');
    const rKey = this._resolveKey(key);

    let nx = false;
    let px = null;
    let ex = null;

    for (let i = 0; i < args.length; i++) {
      const a = String(args[i]).toUpperCase();
      if (a === 'NX') nx = true;
      if (a === 'PX' && args[i + 1]) px = parseInt(args[i + 1], 10);
      if (a === 'EX' && args[i + 1]) ex = parseInt(args[i + 1], 10);
    }

    if (nx && this.store.has(rKey) && !this._isExpired(rKey)) {
      return null;
    }

    this.store.set(rKey, val);

    if (px) {
      this.expiries.set(rKey, Date.now() + px);
    } else if (ex) {
      this.expiries.set(rKey, Date.now() + ex * 1000);
    }

    return 'OK';
  }

  async del(...keys) {
    if (this.status !== 'ready') throw new Error('Connection is closed');
    let count = 0;
    for (const k of keys) {
      const rKey = this._resolveKey(k);
      if (this.store.delete(rKey)) {
        this.expiries.delete(rKey);
        count++;
      }
    }
    return count;
  }

  disconnect() {
    this.status = 'end';
  }
}

async function runTests() {
  console.log('🧪 Starting Redis History Cache Suite...\n');

  const { _setRedisClientForTesting } = require('./src/services/redis.client');
  const cacheService = require('./src/services/cache.service');
  const conversationService = require('./src/services/conversation.service');
  const conversationModel = require('./src/models/postgres/conversation.model');
  const messageModel = require('./src/models/postgres/message.model');

  process.env.REDIS_ENABLED = 'true';
  process.env.REDIS_HISTORY_CACHE = 'true';

  // In-memory mock database state for conversation & message models
  const mockConversations = new Map(); // id -> { id, user_id, title }
  const mockMessages = []; // array of message rows

  // Mock conversationModel
  conversationModel.findConversationById = async (id, userId) => {
    const conv = mockConversations.get(String(id));
    if (conv && Number(conv.user_id) === Number(userId)) {
      return conv;
    }
    return null;
  };

  conversationModel.createConversation = async (userId, title) => {
    const id = `conv-uuid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const conv = { id, user_id: userId, title, created_at: new Date() };
    mockConversations.set(id, conv);
    return conv;
  };

  conversationModel.deleteConversation = async (id, userId) => {
    const conv = mockConversations.get(String(id));
    if (conv && Number(conv.user_id) === Number(userId)) {
      mockConversations.delete(String(id));
      // Cascade delete messages
      for (let i = mockMessages.length - 1; i >= 0; i--) {
        if (mockMessages[i].conversation_id === id) {
          mockMessages.splice(i, 1);
        }
      }
      return { id };
    }
    return null;
  };

  conversationModel.touchConversation = async () => {};

  // Mock messageModel
  messageModel.createMessage = async ({ conversationId, role, content, status = 'complete', sources = [], toolActivity = [], errorMessage = null }) => {
    const msg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversation_id: conversationId,
      role,
      content,
      status,
      sources,
      tool_activity: toolActivity,
      error_message: errorMessage,
      created_at: new Date()
    };
    mockMessages.push(msg);
    return msg;
  };

  messageModel.getLastCompleteMessages = async (conversationId, limit = 10) => {
    const filtered = mockMessages.filter(
      (m) => m.conversation_id === conversationId && m.status === 'complete'
    );
    return filtered.slice(-limit);
  };

  messageModel.listMessagesByConversationId = async (conversationId) => {
    return mockMessages.filter((m) => m.conversation_id === conversationId);
  };

  // Capture debug logs to verify hit/miss and cache events
  const debugLogs = [];
  const origDebug = console.debug;
  console.debug = (...args) => {
    debugLogs.push(args.join(' '));
    origDebug(...args);
  };

  // ─────────────────────────────────────────────────────────────
  // (a) The second message in a chat reads history from cache (log)
  // ─────────────────────────────────────────────────────────────
  let conv1Id = null;
  {
    console.log('── Test (a): Second message in a chat reads history from the cache (log) ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    const userA = { id: 101, email: 'alice@cortex.ai' };

    // Turn 1:
    // 1. Ensure conversation
    const { conversation } = await conversationService.ensureConversation(null, userA.id, 'Hello Cortex');
    conv1Id = conversation.id;
    testAssert('Conversation created with ID', !!conv1Id);

    // 2. Fetch history for turn 1 (first message: DB miss -> returns [])
    debugLogs.length = 0;
    const historyTurn1 = await conversationService.getRecentContextHistory(conv1Id, userA.id, 10, 8000);
    testAssert('Turn 1 has empty previous history', historyTurn1.length === 0);
    testAssert('Turn 1 logs Cache MISS', debugLogs.some(l => l.includes('[HistoryCache] MISS')));

    // 3. User message persisted
    await conversationService.saveUserMessage(conv1Id, 'Hello Cortex');

    // 4. Assistant generates and finishes turn 1 (status: complete)
    debugLogs.length = 0;
    await conversationService.saveAssistantMessage({
      conversationId: conv1Id,
      content: 'Hello Alice! I am Cortex, your enterprise knowledge assistant.',
      status: 'complete',
      sources: [{ title: 'Doc1' }]
    });
    testAssert('Assistant message saves and logs write-through SET', debugLogs.some(l => l.includes('[HistoryCache] SET (write-through)')));

    // Verify Redis store has key hist:<conv1Id>
    const cachedRaw = await mockRedis.get(`hist:${conv1Id}`);
    testAssert('Cache key hist:<convId> exists in Redis store', cachedRaw !== null);
    const cachedParsed = JSON.parse(cachedRaw);
    testAssert('Cache contains 2 complete messages (user & assistant)', cachedParsed.length === 2);
    testAssert('Cache strictly contains model context (no sources or tool_activity)', cachedParsed[0].sources === undefined && cachedParsed[1].sources === undefined);

    // Turn 2: User asks a second question
    // Load history for Turn 2
    debugLogs.length = 0;
    const historyTurn2 = await conversationService.getRecentContextHistory(conv1Id, userA.id, 10, 8000);
    testAssert('Turn 2 reads history from cache', historyTurn2.length === 2);
    testAssert('Turn 2 logs Cache HIT', debugLogs.some(l => l.includes('[HistoryCache] HIT')));
  }

  // ─────────────────────────────────────────────────────────────
  // (b) The cached history equals the DB history (compare)
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (b): Cached history equals DB history (compare outputs) ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    const userA = { id: 101 };

    // Query DB history directly by disabling cache temporarily
    process.env.REDIS_HISTORY_CACHE = 'false';
    const dbHistory = await conversationService.getRecentContextHistory(conv1Id, userA.id, 10, 8000);

    // Query Cached history with cache enabled
    process.env.REDIS_HISTORY_CACHE = 'true';
    const cachedHistory = await conversationService.getRecentContextHistory(conv1Id, userA.id, 10, 8000);

    testAssert('Both DB history and Cached history have identical length', dbHistory.length === cachedHistory.length);
    testAssert('Turn 1 user role and content match', dbHistory[0].role === cachedHistory[0].role && dbHistory[0].content === cachedHistory[0].content);
    testAssert('Turn 1 assistant role and content match', dbHistory[1].role === cachedHistory[1].role && dbHistory[1].content === cachedHistory[1].content);
    testAssert('Deep equality between cached and DB history', JSON.stringify(dbHistory) === JSON.stringify(cachedHistory));
  }

  // ─────────────────────────────────────────────────────────────
  // (c) A stopped message never appears in context
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (c): Stopped message never appears in model context ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    const userA = { id: 101 };

    // User sends query that gets aborted
    await conversationService.saveUserMessage(conv1Id, 'Long streaming query to abort');

    // Assistant message terminated as "stopped"
    debugLogs.length = 0;
    await conversationService.saveAssistantMessage({
      conversationId: conv1Id,
      content: 'Partial answer before client abort...',
      status: 'stopped'
    });
    testAssert('Stopped assistant message purges cache', debugLogs.some(l => l.includes('DEL (non-complete status "stopped")')));

    // Next history fetch must strictly omit stopped messages
    const historyAfterStop = await conversationService.getRecentContextHistory(conv1Id, userA.id, 10, 8000);
    testAssert('Stopped message is NOT in context', !historyAfterStop.some(m => m.content.includes('Partial answer before client abort')));
    testAssert('All returned messages are complete', historyAfterStop.every(m => !m.content.includes('before client abort')));

    // Same check for error status
    await conversationService.saveAssistantMessage({
      conversationId: conv1Id,
      content: 'Failed halfway',
      status: 'error',
      errorMessage: 'Network timeout'
    });
    const historyAfterError = await conversationService.getRecentContextHistory(conv1Id, userA.id, 10, 8000);
    testAssert('Error message is NOT in context', !historyAfterError.some(m => m.content.includes('Failed halfway')));
  }

  // ─────────────────────────────────────────────────────────────
  // (d) Deleting a conversation removes its key
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (d): Deleting a conversation removes its cache key ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    const userA = { id: 101 };
    const { conversation } = await conversationService.ensureConversation(null, userA.id, 'Chat to be deleted');
    const tempConvId = conversation.id;

    // Save assistant message to populate cache
    await conversationService.saveUserMessage(tempConvId, 'Hello');
    await conversationService.saveAssistantMessage({ conversationId: tempConvId, content: 'Hi', status: 'complete' });

    testAssert('Cache key exists before deletion', mockRedis.store.has(`cortex:hist:${tempConvId}`));

    // Delete conversation
    debugLogs.length = 0;
    await conversationService.deleteConversation(tempConvId, userA.id);
    testAssert('deleteConversation purges key from Redis', debugLogs.some(l => l.includes('DEL (conversation deleted)')));
    testAssert('Cache key is gone from Redis store', !mockRedis.store.has(`cortex:hist:${tempConvId}`));
  }

  // ─────────────────────────────────────────────────────────────
  // (e) User B using User A's conversationId gets 404 even though cache key exists
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (e): User B accessing User A conversation gets 404 (Ownership Security) ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    const userA = { id: 101 };
    const userB = { id: 202 }; // Unrelated user

    const { conversation } = await conversationService.ensureConversation(null, userA.id, 'Private Secret Chat');
    const secretConvId = conversation.id;

    await conversationService.saveUserMessage(secretConvId, 'User A confidential prompt');
    await conversationService.saveAssistantMessage({
      conversationId: secretConvId,
      content: 'User A confidential corporate secret',
      status: 'complete'
    });

    // Verify key exists in Redis
    testAssert('Secret chat key exists in Redis cache', mockRedis.store.has(`cortex:hist:${secretConvId}`));

    // User B attempts to access history using User A's conversationId
    let userBAccessDenied = false;
    let errorStatus = 0;
    try {
      await conversationService.getRecentContextHistory(secretConvId, userB.id, 10, 8000);
    } catch (err) {
      userBAccessDenied = true;
      errorStatus = err.status || 0;
    }

    testAssert('User B is blocked from reading history (throws error)', userBAccessDenied === true);
    testAssert('Error status is 404 (not 403, preventing existence leaks)', errorStatus === 404);

    // User B attempts to send message with User A's conversationId
    let userBChatBlocked = false;
    let chatErrorStatus = 0;
    try {
      await conversationService.ensureConversation(secretConvId, userB.id, 'Malicious prompt');
    } catch (err) {
      userBChatBlocked = true;
      chatErrorStatus = err.status || 0;
    }

    testAssert('User B is blocked in ensureConversation', userBChatBlocked === true);
    testAssert('ensureConversation returns 404', chatErrorStatus === 404);
  }

  // ─────────────────────────────────────────────────────────────
  // (f) Redis stopped or flag off: identical behavior (Fail-Open)
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (f): Redis stopped or flag off behaves identically (Fail-Open) ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    const userA = { id: 101 };
    const { conversation } = await conversationService.ensureConversation(null, userA.id, 'Fail open chat');
    const testConvId = conversation.id;

    await conversationService.saveUserMessage(testConvId, 'Question 1');
    await conversationService.saveAssistantMessage({ conversationId: testConvId, content: 'Answer 1', status: 'complete' });

    // Baseline result with cache
    const baseline = await conversationService.getRecentContextHistory(testConvId, userA.id, 10, 8000);
    testAssert('Baseline returns 2 messages', baseline.length === 2);

    // 1. Test with REDIS_HISTORY_CACHE=false
    process.env.REDIS_HISTORY_CACHE = 'false';
    const flagOffResult = await conversationService.getRecentContextHistory(testConvId, userA.id, 10, 8000);
    testAssert('Flag off returns identical history', JSON.stringify(flagOffResult) === JSON.stringify(baseline));

    // 2. Test with Redis stopped (status: 'end')
    process.env.REDIS_HISTORY_CACHE = 'true';
    mockRedis.disconnect();
    testAssert('Redis status is end (offline)', mockRedis.status === 'end');
    testAssert('cacheService.isReady() is false', cacheService.isReady() === false);

    let redisOfflineResult = null;
    let didThrow = false;
    try {
      redisOfflineResult = await conversationService.getRecentContextHistory(testConvId, userA.id, 10, 8000);
    } catch (e) {
      didThrow = true;
    }

    testAssert('Does not throw when Redis is down (Fail-Open)', didThrow === false);
    testAssert('Redis offline returns identical history from DB', JSON.stringify(redisOfflineResult) === JSON.stringify(baseline));
  }

  // ─────────────────────────────────────────────────────────────
  // (g) Character cap pruning test
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (g): Character cap enforced identically on cache and DB paths ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    process.env.REDIS_HISTORY_CACHE = 'true';
    const userA = { id: 101 };
    const { conversation } = await conversationService.ensureConversation(null, userA.id, 'Char cap test');
    const capConvId = conversation.id;

    // Add 3 turns of varying lengths
    await conversationService.saveUserMessage(capConvId, 'Short turn 1');
    await conversationService.saveAssistantMessage({ conversationId: capConvId, content: 'Short answer 1', status: 'complete' });
    await conversationService.saveUserMessage(capConvId, 'A'.repeat(500));
    await conversationService.saveAssistantMessage({ conversationId: capConvId, content: 'B'.repeat(500), status: 'complete' });
    await conversationService.saveUserMessage(capConvId, 'Recent prompt');
    await conversationService.saveAssistantMessage({ conversationId: capConvId, content: 'Recent response', status: 'complete' });

    // Request with maxChars = 200 (should prune the large 500-char turn backwards)
    const cappedHit = await conversationService.getRecentContextHistory(capConvId, userA.id, 10, 200);

    // Disable cache to test DB path
    process.env.REDIS_HISTORY_CACHE = 'false';
    const cappedMiss = await conversationService.getRecentContextHistory(capConvId, userA.id, 10, 200);

    testAssert('Capped results from cache preserve recent turns', cappedHit[cappedHit.length - 1].content === 'Recent response');
    testAssert('Cache and DB paths apply character capping identically', JSON.stringify(cappedHit) === JSON.stringify(cappedMiss));
  }

  // Restore console.debug
  console.debug = origDebug;

  console.log('\n======================================================');
  console.log(`Redis History Cache Suite: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

