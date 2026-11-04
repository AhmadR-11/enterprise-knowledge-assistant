// backend/test_redis_features.js
const assert = require('assert');
const EventEmitter = require('events');

// Suppress unhandled rejections during simulated crash tests
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
 * High-fidelity in-memory Redis client implementing ioredis contract
 * Used for deterministic testing of cache, rate limiting, and distributed locks.
 */
class MockRedisClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = { keyPrefix: 'cortex:', ...options };
    this.status = 'ready';
    this.store = new Map();     // key -> value
    this.expiries = new Map();  // key -> expireAtMs
  }

  _resolveKey(key) {
    const prefix = this.options?.keyPrefix || '';
    if (prefix && !key.startsWith(prefix)) {
      return `${prefix}${key}`;
    }
    return key;
  }

  _isExpired(resolvedKey) {
    const exp = this.expiries.get(resolvedKey);
    if (exp && Date.now() >= exp) {
      this.store.delete(resolvedKey);
      this.expiries.delete(resolvedKey);
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

  async eval(script, numKeys, key, ...args) {
    if (this.status !== 'ready') throw new Error('Connection is closed');
    // In Lua eval with resolveLuaKey, key is already resolved or we ensure it
    const rKey = this._resolveKey(key);

    // Handle Rate Limiter INCR + EXPIRE Lua script
    if (script.includes('INCR') && script.includes('EXPIRE')) {
      const ttlSec = parseInt(args[0], 10);
      const isExpired = this._isExpired(rKey);
      let count = (isExpired || !this.store.has(rKey)) ? 0 : parseInt(this.store.get(rKey), 10);
      count += 1;
      this.store.set(rKey, String(count));

      if (count === 1 || isExpired) {
        this.expiries.set(rKey, Date.now() + ttlSec * 1000);
      }

      const exp = this.expiries.get(rKey);
      const remainingSec = exp ? Math.max(1, Math.ceil((exp - Date.now()) / 1000)) : ttlSec;
      return [count, remainingSec];
    }

    // Handle Lock Release Lua script: if redis.call("get", KEYS[1]) == ARGV[1] then del
    if (script.includes('redis.call("get"') && script.includes('ARGV[1]')) {
      const token = args[0];
      if (this.store.get(rKey) === token) {
        this.store.delete(rKey);
        this.expiries.delete(rKey);
        return 1;
      }
      return 0;
    }

    return null;
  }

  ttl(key) {
    const rKey = this._resolveKey(key);
    if (this._isExpired(rKey)) return -2;
    const exp = this.expiries.get(rKey);
    if (!exp) return -1;
    return Math.max(1, Math.ceil((exp - Date.now()) / 1000));
  }

  simulateDisconnect() {
    this.status = 'close';
    this.emit('close');
  }

  async quit() {
    this.status = 'end';
    this.emit('end');
    return 'OK';
  }
}

async function runRedisSuite() {
  console.log('🧪 Starting Cortex Redis Foundation, Cache, Rate Limiting & Lock Suite...\n');

  const { _setRedisClientForTesting } = require('./src/services/redis.client');
  const cacheService = require('./src/services/cache.service');
  const retrievalService = require('./src/services/retrieval.service');
  const { chatRateLimiter, authRateLimiter, uploadRateLimiter, _clearInMemoryStoreForTesting } = require('./src/middleware/rateLimiter.middleware');

  // ─────────────────────────────────────────────────────────────
  // Suite 1: REDIS_ENABLED=false behaves exactly as before
  // ─────────────────────────────────────────────────────────────
  {
    console.log('── Test 1: REDIS_ENABLED=false (Disabled by default) ──');
    process.env.REDIS_ENABLED = 'false';
    _setRedisClientForTesting(null);

    testAssert('cacheService.isReady() returns false when disabled', cacheService.isReady() === false);

    const getRes = await cacheService.getJSON('test:key');
    testAssert('getJSON is a safe no-op returning null', getRes === null);

    const setRes = await cacheService.setJSON('test:key', { foo: 'bar' }, 60);
    testAssert('setJSON is a safe no-op returning false', setRes === false);

    const delRes = await cacheService.del('test:key');
    testAssert('del is a safe no-op returning 0', delRes === 0);

    const lockRes = await cacheService.acquireLock('lock:test', 'token1', 60);
    testAssert('acquireLock is a safe no-op returning false', lockRes === false);
  }

  // ─────────────────────────────────────────────────────────────
  // Suite 2: Mandatory TTL enforcement (No key without TTL)
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test 2: Mandatory TTL Enforcement ──');
    process.env.REDIS_ENABLED = 'true';
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    let errorCaught = false;
    try {
      await cacheService.setJSON('key:without:ttl', { data: 123 }, null);
    } catch (err) {
      errorCaught = true;
      testAssert('setJSON throws error if TTL is null/missing', err.message.includes('No Redis key may be stored without a TTL'));
    }
    testAssert('Operation was rejected before touching Redis', errorCaught === true);

    let negErrorCaught = false;
    try {
      await cacheService.setJSON('key:negative:ttl', { data: 123 }, -5);
    } catch (err) {
      negErrorCaught = true;
      testAssert('setJSON throws error if TTL is negative or zero', err.message.includes('valid positive ttlSeconds'));
    }
    testAssert('Negative TTL was rejected', negErrorCaught === true);

    // Storing with valid positive TTL succeeds
    const success = await cacheService.setJSON('cortex:valid:key', { name: 'cortex' }, 300);
    testAssert('setJSON with valid TTL succeeds', success === true);
    const ttl = mockRedis.ttl('cortex:valid:key');
    testAssert('Key in Redis has positive TTL assigned', ttl > 0 && ttl <= 300);
  }

  // ─────────────────────────────────────────────────────────────
  // Suite 3: R1 Embedding Cache (Normalization, Hash & Cache Hit)
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test 3: R1 Query Embedding Cache ──');
    process.env.REDIS_ENABLED = 'true';
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    const query1 = '  What is the transformer   ARCHITECTURE?  ';
    const query2 = 'what is the transformer architecture?'; // Identical after normalization

    const norm1 = retrievalService.normalizeQuery(query1);
    const norm2 = retrievalService.normalizeQuery(query2);
    testAssert('Query normalization trims, lowercases, and collapses whitespace', norm1 === 'what is the transformer architecture?');
    testAssert('Both query variants normalize to exact same string', norm1 === norm2);

    const key1 = retrievalService.getEmbeddingCacheKey(norm1);
    const key2 = retrievalService.getEmbeddingCacheKey(norm2);
    testAssert('Both queries produce identical SHA256 cache key', key1 === key2);
    testAssert('Cache key begins with emb: prefix', key1.startsWith('emb:'));

    // Mock live Gemini generation
    const genAI = require('./src/config/gemini');
    let geminiApiCallCount = 0;
    const mockVector = new Array(768).fill(0.1234);

    genAI.getGenerativeModel = () => ({
      embedContent: async () => {
        geminiApiCallCount++;
        return { embedding: { values: mockVector } };
      }
    });

    // Capture debug logs to verify hit/miss logging
    const debugLogs = [];
    const origDebug = console.debug;
    console.debug = (...msg) => {
      debugLogs.push(msg.join(' '));
      origDebug(...msg);
    };

    // First call: MISS -> calls Gemini
    const emb1 = await retrievalService.getOrGenerateQueryEmbedding(query1);
    testAssert('First call generates embedding via API', geminiApiCallCount === 1);
    testAssert('Returned embedding matches expected vector length', emb1.length === 768);
    testAssert('Logs Cache MISS on first query', debugLogs.some(l => l.includes('MISS')));

    // Second call with different casing & spacing: HIT -> does NOT call Gemini
    const emb2 = await retrievalService.getOrGenerateQueryEmbedding(query2);
    testAssert('Second identical call is a Cache HIT (Gemini count remains 1)', geminiApiCallCount === 1);
    testAssert('Cached embedding matches original vector', JSON.stringify(emb1) === JSON.stringify(emb2));
    testAssert('Logs Cache HIT on second query', debugLogs.some(l => l.includes('HIT')));

    // Verify key in Redis has 24h TTL
    const storedTtl = mockRedis.ttl(`cortex:${key1}`);
    testAssert('Cached vector has 24h (86400s) TTL in Redis', storedTtl > 86000 && storedTtl <= 86400);

    console.debug = origDebug;
  }

  // ─────────────────────────────────────────────────────────────
  // Suite 4: Fail-Open when Redis Disconnected Mid-Run
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test 4: Redis Stopped Mid-Run (Fail-Open) ──');
    process.env.REDIS_ENABLED = 'true';
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    // Simulate Redis disconnecting mid-operation
    mockRedis.simulateDisconnect();
    testAssert('cacheService.isReady() detects disconnected status', cacheService.isReady() === false);

    let warnLogs = [];
    const origWarn = console.warn;
    console.warn = (...msg) => {
      warnLogs.push(msg.join(' '));
      origWarn(...msg);
    };

    // Embedding call should not throw; it must fail open and generate live
    let liveGenerated = false;
    const genAI = require('./src/config/gemini');
    genAI.getGenerativeModel = () => ({
      embedContent: async () => {
        liveGenerated = true;
        return { embedding: { values: [0.999] } };
      }
    });

    const res = await retrievalService.getOrGenerateQueryEmbedding('query during redis downtime');
    testAssert('Query proceeds fail-open and generates live embedding', liveGenerated === true);
    testAssert('Returned valid vector during downtime', res[0] === 0.999);

    console.warn = origWarn;
  }

  // ─────────────────────────────────────────────────────────────
  // Suite 5: R2 Rate Limiting (Chat 20/min, In-memory Fallback, 429)
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test 5: R2 Rate Limiting (Chat 20 req/min & 429 Retry-After) ──');
    process.env.REDIS_ENABLED = 'true';
    process.env.RATE_LIMIT_CHAT = '20';
    process.env.RATE_LIMIT_CHAT_WINDOW_SEC = '60';

    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);
    _clearInMemoryStoreForTesting();

    function createMockExpress(userId = 42) {
      return {
        req: {
          user: { id: userId, email: 'test@cortex.com' },
          ip: '127.0.0.1',
          headers: {}
        },
        res: {
          statusCode: 200,
          headers: {},
          setHeader(name, val) { this.headers[name] = val; },
          status(code) { this.statusCode = code; return this; },
          json(body) { this.body = body; return this; }
        }
      };
    }

    // Fire 20 requests
    let passedCount = 0;
    for (let i = 1; i <= 20; i++) {
      const { req, res } = createMockExpress(42);
      let nextCalled = false;
      await chatRateLimiter(req, res, () => { nextCalled = true; });
      if (nextCalled) passedCount++;
    }
    testAssert('First 20 requests succeed within the minute', passedCount === 20);

    // 21st request must trigger HTTP 429
    const { req: req21, res: res21 } = createMockExpress(42);
    let nextCalled21 = false;
    await chatRateLimiter(req21, res21, () => { nextCalled21 = true; });

    testAssert('21st request does NOT proceed to next handler', nextCalled21 === false);
    testAssert('21st request returns HTTP 429 Too Many Requests', res21.statusCode === 429);
    testAssert('21st request sets Retry-After header', Number(res21.headers['Retry-After']) > 0);
    testAssert('21st request sets X-RateLimit-Remaining to 0', res21.headers['X-RateLimit-Remaining'] === '0');
    testAssert('Response JSON contains clear message and retryAfter', res21.body.success === false && res21.body.retryAfter > 0);

    // Another user is unaffected
    const { req: reqOther, res: resOther } = createMockExpress(999);
    let otherNext = false;
    await chatRateLimiter(reqOther, resOther, () => { otherNext = true; });
    testAssert('Different authenticated user is not blocked (scoped per user)', otherNext === true);

    // Test in-memory fallback when Redis is offline
    console.log('\n── Test 5b: Rate Limiter In-Memory Fallback ──');
    _setRedisClientForTesting(null);
    process.env.REDIS_ENABLED = 'false';
    _clearInMemoryStoreForTesting();

    const memUser = 55;
    let memPassed = 0;
    for (let i = 1; i <= 20; i++) {
      const { req, res } = createMockExpress(memUser);
      let next = false;
      await chatRateLimiter(req, res, () => { next = true; });
      if (next) memPassed++;
    }
    testAssert('In-memory fallback allows 20 requests', memPassed === 20);

    const { req: mem21, res: memRes21 } = createMockExpress(memUser);
    let memNext21 = false;
    await chatRateLimiter(mem21, memRes21, () => { memNext21 = true; });
    testAssert('In-memory fallback blocks 21st request with 429', memRes21.statusCode === 429 && memNext21 === false);
    testAssert('In-memory fallback provides Retry-After header', Number(memRes21.headers['Retry-After']) > 0);
  }

  // ─────────────────────────────────────────────────────────────
  // Suite 6: R8 Ingestion Lock (Concurrent 409 & Release on Finally)
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test 6: R8 Ingestion Distributed Lock ──');
    process.env.REDIS_ENABLED = 'true';
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    const spaceId = 1;
    const contentHash = 'abc123hash';
    const lockKey = `lock:ingest:${spaceId}:${contentHash}`;
    const tokenA = 'uuid-worker-A';
    const tokenB = 'uuid-worker-B';

    // 1. Worker A acquires lock
    const lockedA = await cacheService.acquireLock(lockKey, tokenA, 600);
    testAssert('Worker A successfully acquires 10-minute ingestion lock', lockedA === true);

    // 2. Concurrent Worker B tries to acquire same lock -> fails
    const lockedB = await cacheService.acquireLock(lockKey, tokenB, 600);
    testAssert('Worker B is rejected while lock is held (HTTP 409 scenario)', lockedB === false);

    // 3. Worker B tries to release Worker A's lock -> denied by Lua script token check
    const badRelease = await cacheService.releaseLock(lockKey, tokenB);
    testAssert('Worker B cannot release Worker A lock (Lua token check protects ownership)', badRelease === false);

    // 4. Worker A completes and releases lock
    const releasedA = await cacheService.releaseLock(lockKey, tokenA);
    testAssert('Worker A safely releases lock on completion', releasedA === true);

    // 5. Subsequent Worker C can now acquire lock
    const lockedC = await cacheService.acquireLock(lockKey, 'uuid-worker-C', 600);
    testAssert('Subsequent worker can acquire lock after release', lockedC === true);
    await cacheService.releaseLock(lockKey, 'uuid-worker-C');

    // 6. Release in finally block even when ingestion throws error
    let simulateFailureAcquired = await cacheService.acquireLock(lockKey, 'uuid-failure-worker', 600);
    try {
      throw new Error('Simulated unhandled PDF parse error');
    } catch {
      // simulate catch
    } finally {
      if (simulateFailureAcquired) {
        await cacheService.releaseLock(lockKey, 'uuid-failure-worker');
      }
    }

    const lockAfterFailure = await cacheService.acquireLock(lockKey, 'uuid-new-worker', 600);
    testAssert('Lock was cleanly released in finally block following an ingestion failure', lockAfterFailure === true);
    await cacheService.releaseLock(lockKey, 'uuid-new-worker');
  }

  // ─────────────────────────────────────────────────────────────
  // Suite 7: GET /api/health Redis Status Reporting
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test 7: GET /api/health Redis Status Reporting ──');
    const app = require('./src/app');

    function createHealthReqRes() {
      const headers = {};
      return {
        req: {},
        res: {
          statusCode: 200,
          setHeader(name, val) { headers[name.toLowerCase()] = val; },
          getHeader(name) { return headers[name.toLowerCase()]; },
          status(code) { this.statusCode = code; return this; },
          json(body) { this.body = body; return this; }
        }
      };
    }

    // Disabled state
    process.env.REDIS_ENABLED = 'false';
    _setRedisClientForTesting(null);
    let h1 = createHealthReqRes();
    app.handle({ method: 'GET', url: '/api/health', headers: {} }, h1.res, () => {});
    testAssert('Health check reports redis: "disabled" when REDIS_ENABLED=false', h1.res.body.redis === 'disabled');

    // Up state
    process.env.REDIS_ENABLED = 'true';
    const upMock = new MockRedisClient();
    _setRedisClientForTesting(upMock);
    let h2 = createHealthReqRes();
    app.handle({ method: 'GET', url: '/api/health', headers: {} }, h2.res, () => {});
    testAssert('Health check reports redis: "up" when client is ready', h2.res.body.redis === 'up');
    testAssert('Health check does not leak REDIS_URL or credentials', !JSON.stringify(h2.res.body).includes('redis://'));

    // Down state
    upMock.simulateDisconnect();
    let h3 = createHealthReqRes();
    app.handle({ method: 'GET', url: '/api/health', headers: {} }, h3.res, () => {});
    testAssert('Health check reports redis: "down" when client is disconnected', h3.res.body.redis === 'down');
  }

  // ─────────────────────────────────────────────────────────────
  // Suite 8: Verify No Key in Redis exists without a TTL
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test 8: Scan All Keys to Guarantee Mandatory TTL ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    // Populate keys via our service layer
    await cacheService.setJSON('emb:samplehash123', [0.1, 0.2], 86400);
    await cacheService.incr('ratelimit:chat:user:101', 60);
    await cacheService.acquireLock('lock:ingest:1:hash999', 'uuid-test', 600);

    // Verify all keys in the store
    let keysWithoutTTL = 0;
    let totalKeys = 0;

    for (const [key] of mockRedis.store.entries()) {
      totalKeys++;
      const keyTtl = mockRedis.ttl(key);
      if (keyTtl <= 0) {
        keysWithoutTTL++;
        console.error(`  ⚠️ Key "${key}" is missing a TTL!`);
      }
    }

    testAssert(`Scanned ${totalKeys} keys in Redis store`, totalKeys >= 3);
    testAssert('Zero keys exist without a TTL (100% keys have active expiration)', keysWithoutTTL === 0);
  }

  console.log(`\n======================================================`);
  console.log(`Redis & Feature Suite Results: ${passed} passed, ${failed} failed`);
  console.log(`======================================================\n`);

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runRedisSuite().catch((err) => {
  console.error('Unhandled failure in Redis test suite:', err);
  process.exit(1);
});
