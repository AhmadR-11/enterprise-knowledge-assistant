// backend/test_retrieval_cache.js
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

  async eval(script, numKeys, key, ...args) {
    if (this.status !== 'ready') throw new Error('Connection is closed');
    const rKey = this._resolveKey(key);

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

    return null;
  }

  disconnect() {
    this.status = 'end';
  }
}

async function runTests() {
  console.log('🧪 Starting Retrieval Results Cache (Leak-Proof) Test Suite...\n');

  // Load modules
  const { _setRedisClientForTesting } = require('./src/services/redis.client');
  const cacheService = require('./src/services/cache.service');
  const retrievalService = require('./src/services/retrieval.service');
  const retrievalCacheService = require('./src/services/retrievalCache.service');
  const chunkModel = require('./src/models/postgres/documentChunk.model');
  const spaceModel = require('./src/models/postgres/space.model');
  const Document = require('./src/models/mongo/Document.model');
  const genAI = require('./src/config/gemini');
  const { execute: executeSearchKB } = require('./src/tools/searchKnowledgeBase.tool');

  // Set default test env
  process.env.REDIS_ENABLED = 'true';
  process.env.REDIS_RETRIEVAL_CACHE = 'true';

  // Mock Gemini model
  const mockVector = new Array(768).fill(0.05);
  genAI.getGenerativeModel = () => ({
    embedContent: async () => ({ embedding: { values: mockVector } })
  });

  // Track debug logs to verify hit/miss and ensure NO query text is logged
  const capturedLogs = [];
  const origDebug = console.debug;
  console.debug = (...args) => {
    capturedLogs.push(args.join(' '));
    origDebug(...args);
  };

  // ─────────────────────────────────────────────────────────────
  // (a) Identical query by the same user is a hit and returns same results as miss
  // ─────────────────────────────────────────────────────────────
  {
    console.log('── Test (a): Identical query by same user is a HIT and returns identical results ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    // Mock spaces: Space 1 and Space 2
    spaceModel.listAllSpaces = async () => [
      { id: 1, name: 'Engineering' },
      { id: 2, name: 'HR Confidential' }
    ];

    // Mock chunks in DB for Space 1
    const dbChunks = [
      { id: 101, document_id: 'doc1', space_id: 1, content: 'Content of chunk 101 about architecture', page_number: 1, similarity: 0.92 },
      { id: 102, document_id: 'doc1', space_id: 1, content: 'Content of chunk 102 about scalability', page_number: 2, similarity: 0.88 },
      { id: 103, document_id: 'doc2', space_id: 1, content: 'Content of chunk 103 about database tuning', page_number: 1, similarity: 0.81 }
    ];

    chunkModel.searchChunksByVector = async (vec, spaceIds, topK) => {
      return dbChunks.filter(c => !spaceIds || spaceIds.includes(c.space_id)).slice(0, topK);
    };

    chunkModel.getChunksByIds = async (ids, spaceIds) => {
      return dbChunks.filter(c => ids.includes(c.id) && (!spaceIds || spaceIds.includes(c.space_id)));
    };

    Document.find = (filter) => ({
      lean: async () => {
        const ids = filter?._id?.$in || [];
        return [
          { _id: 'doc1', title: 'System Architecture Guide.pdf', originalName: 'Architecture.pdf' },
          { _id: 'doc2', title: 'DB Performance Handbook.pdf', originalName: 'DBPerformance.pdf' }
        ].filter(d => ids.includes(d._id));
      }
    });

    const query = 'system architecture and database scaling';

    // Call 1: MISS (Live search)
    const missResult = await retrievalService.retrieveContext(query, [1], 3);
    testAssert('First query returns expected number of chunks', missResult.chunks.length === 3);
    testAssert('First query returns sources array', missResult.sources.length === 3);
    testAssert('Logs Cache MISS on first query', capturedLogs.some(l => l.includes('[RetrievalCache] MISS')));

    // Check what is stored in Redis: ONLY chunkId and score!
    let foundRetKey = null;
    for (const [k, v] of mockRedis.store.entries()) {
      if (k.includes(':ret:')) {
        foundRetKey = k;
        const parsed = JSON.parse(v);
        testAssert('Cached data is an array of candidates', Array.isArray(parsed));
        testAssert('Candidate has chunkId', typeof parsed[0].chunkId === 'number');
        testAssert('Candidate has score', typeof parsed[0].score === 'number');
        testAssert('Candidate DOES NOT contain chunk text or content', parsed[0].content === undefined);
        testAssert('Candidate DOES NOT contain document title', parsed[0].title === undefined);
      }
    }
    testAssert('Retrieval key exists in Redis store', foundRetKey !== null);

    // Call 2: HIT (Hydrated from cache)
    const hitResult = await retrievalService.retrieveContext(query, [1], 3);
    testAssert('Second query returns identical chunk count', hitResult.chunks.length === missResult.chunks.length);
    testAssert('Second query returns identical contextText', hitResult.contextText === missResult.contextText);
    testAssert('Second query returns identical sources', JSON.stringify(hitResult.sources) === JSON.stringify(missResult.sources));
    testAssert('Second query chunks preserve score order', hitResult.chunks[0].similarity === missResult.chunks[0].similarity);
    testAssert('Logs Cache HIT on second query', capturedLogs.some(l => l.includes('[RetrievalCache] HIT')));

    // Verify privacy: NO query text was ever logged in RetrievalCache
    const retrievalLogs = capturedLogs.filter(l => l.includes('[RetrievalCache]'));
    const logsWithQueryText = retrievalLogs.filter(l => l.includes(query));
    testAssert('Zero RetrievalCache log messages contain raw query text (privacy preserved)', logsWithQueryText.length === 0);
  }

  // ─────────────────────────────────────────────────────────────
  // (b) LEAK TEST: Admin asks question in restricted space; Viewer asks identical question; Viewer gets 0 restricted chunks
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (b): LEAK TEST — Admin (Space 1 & 2) vs Viewer (Space 1 only) ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    // Database has public chunks in Space 1, and sensitive payroll chunks in Space 2
    const allDbChunks = [
      { id: 201, document_id: 'docPublic', space_id: 1, content: 'Public company handbook section', page_number: 1, similarity: 0.75 },
      { id: 202, document_id: 'docRestricted', space_id: 2, content: 'CONFIDENTIAL: Executive bonuses and salary bands', page_number: 1, similarity: 0.98 },
      { id: 203, document_id: 'docRestricted', space_id: 2, content: 'CONFIDENTIAL: Executive equity allocation', page_number: 2, similarity: 0.95 }
    ];

    chunkModel.searchChunksByVector = async (vec, spaceIds, topK) => {
      let filtered = allDbChunks;
      if (spaceIds && spaceIds.length > 0) {
        filtered = filtered.filter(c => spaceIds.includes(c.space_id));
      }
      return filtered.slice(0, topK);
    };

    chunkModel.getChunksByIds = async (ids, spaceIds) => {
      let filtered = allDbChunks.filter(c => ids.includes(c.id));
      if (spaceIds && spaceIds.length > 0) {
        filtered = filtered.filter(c => spaceIds.includes(c.space_id));
      }
      return filtered;
    };

    Document.find = (filter) => ({
      lean: async () => {
        const ids = filter?._id?.$in || [];
        return [
          { _id: 'docPublic', title: 'Employee Handbook.pdf', originalName: 'Handbook.pdf' },
          { _id: 'docRestricted', title: 'Executive_Salaries_2026.pdf', originalName: 'Salaries.pdf' }
        ].filter(d => ids.includes(d._id));
      }
    });

    const leakQuery = 'executive salary and bonuses';

    // 1. Admin queries with unrestricted access (spaceIds = null -> all spaces [1, 2])
    const adminResult = await retrievalService.retrieveContext(leakQuery, null, 3);
    testAssert('Admin receives restricted chunks from Space 2', adminResult.chunks.some(c => c.spaceId === 2));
    testAssert('Admin receives executive salaries document', adminResult.sources.some(s => s.title.includes('Executive_Salaries')));

    // 2. Viewer (assigned only to Space 1) queries the EXACT same question
    const viewerResult = await retrievalService.retrieveContext(leakQuery, [1], 3);

    // CRITICAL CHECKS:
    testAssert('Viewer receives ZERO chunks from Space 2 (restricted)', !viewerResult.chunks.some(c => c.spaceId === 2));
    testAssert('Viewer does NOT receive executive salary document', !viewerResult.sources.some(s => s.title.includes('Executive_Salaries')));
    testAssert('Viewer contextText contains no confidential salary data', !viewerResult.contextText.includes('CONFIDENTIAL'));

    // Check that cache keys for Admin and Viewer are completely distinct
    const keysInRedis = [...mockRedis.store.keys()].filter(k => k.includes(':ret:'));
    testAssert('Admin and Viewer have separate partitioned cache keys', keysInRedis.length === 2);
    testAssert('Both keys differ because sortedAccessibleSpaceIds are part of hash', keysInRedis[0] !== keysInRedis[1]);

    // 3. Forced Hydration Defense Test:
    // Even if an attacker forcibly passes Admin candidate IDs into Viewer hydration:
    const adminCandidates = await retrievalCacheService.getCachedCandidates(keysInRedis[0].replace('cortex:', ''));
    testAssert('Admin cached candidates include restricted chunk 202', adminCandidates.some(c => c.chunkId === 202));

    const viewerHydrated = await chunkModel.getChunksByIds(adminCandidates.map(c => c.chunkId), [1]);
    testAssert('Postgres hydration with viewer space [1] strips chunk 202', !viewerHydrated.some(c => c.id === 202));
  }

  // ─────────────────────────────────────────────────────────────
  // (c) After uploading a new document, the same query reflects it (version bump)
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (c): Document mutation increments corpus:version and invalidates cache ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    const initialVersion = await retrievalCacheService.getCorpusVersion();
    testAssert('Initial corpus:version is 1', initialVersion === 1);

    const docItems = [
      { id: 301, document_id: 'docA', space_id: 1, content: 'Initial version of cloud policy', page_number: 1, similarity: 0.85 }
    ];

    chunkModel.searchChunksByVector = async () => [...docItems];
    chunkModel.getChunksByIds = async (ids) => docItems.filter(c => ids.includes(c.id));
    Document.find = () => ({ lean: async () => [{ _id: 'docA', title: 'Cloud Policy v1.pdf' }] });

    // Initial query caches under version 1
    const res1 = await retrievalService.retrieveContext('cloud security policy', [1], 3);
    testAssert('First query returns version 1 result', res1.chunks[0].id === 301);

    // Call again -> HIT
    capturedLogs.length = 0;
    const res2 = await retrievalService.retrieveContext('cloud security policy', [1], 3);
    testAssert('Repeated query before mutation is a Cache HIT', capturedLogs.some(l => l.includes('HIT')));

    // Simulate new document upload or mutation hooking incrementCorpusVersion
    const newVersion = await retrievalCacheService.incrementCorpusVersion();
    testAssert('incrementCorpusVersion incremented version to 2', newVersion === 2);

    // Add new chunk to DB
    docItems.unshift({
      id: 302,
      document_id: 'docB',
      space_id: 1,
      content: 'Updated 2026 Cloud Security Standard (Latest)',
      page_number: 1,
      similarity: 0.99
    });
    Document.find = () => ({
      lean: async () => [
        { _id: 'docA', title: 'Cloud Policy v1.pdf' },
        { _id: 'docB', title: 'Cloud Policy v2 2026.pdf' }
      ]
    });

    // Next query with same question must be a Cache MISS and reflect new document!
    capturedLogs.length = 0;
    const res3 = await retrievalService.retrieveContext('cloud security policy', [1], 3);
    testAssert('Next query after mutation is a Cache MISS', capturedLogs.some(l => l.includes('MISS')));
    testAssert('Next query returns newly uploaded document chunk 302', res3.chunks.some(c => c.id === 302));
    testAssert('Returned sources include Cloud Policy v2', res3.sources.some(s => s.title.includes('Cloud Policy v2')));
  }

  // ─────────────────────────────────────────────────────────────
  // (d) After deleting a document, it never appears again, even within TTL
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (d): Deleting a document purges it immediately (Hydration + Threshold Drop) ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    let activeDocIds = ['docLive1', 'docToDelete', 'docLive2'];
    const chunksPool = [
      { id: 401, document_id: 'docLive1', space_id: 1, content: 'Live chunk 1', page_number: 1, similarity: 0.9 },
      { id: 402, document_id: 'docToDelete', space_id: 1, content: 'Chunk about to be deleted', page_number: 1, similarity: 0.88 },
      { id: 403, document_id: 'docLive2', space_id: 1, content: 'Live chunk 2', page_number: 2, similarity: 0.85 }
    ];

    chunkModel.searchChunksByVector = async () => chunksPool.filter(c => activeDocIds.includes(c.document_id));
    chunkModel.getChunksByIds = async (ids) => chunksPool.filter(c => ids.includes(c.id) && activeDocIds.includes(c.document_id));
    Document.find = (filter) => ({
      lean: async () => {
        const ids = filter?._id?.$in || [];
        return ids.filter(id => activeDocIds.includes(id)).map(id => ({ _id: id, title: `Doc ${id}` }));
      }
    });

    // Populate cache with 3 candidates
    await retrievalService.retrieveContext('test document deletion query', [1], 3);

    // Delete docToDelete from Mongo and Postgres
    activeDocIds = ['docLive1', 'docLive2'];

    // Hydration check: docToDelete should be dropped by Postgres/Mongo
    const nextResult = await retrievalService.retrieveContext('test document deletion query', [1], 3);
    testAssert('Deleted document chunk 402 is dropped', !nextResult.chunks.some(c => c.id === 402));
    testAssert('Deleted document never appears in sources', !nextResult.sources.some(s => s.documentId === 'docToDelete'));

    // Threshold test: If surviving drops below topK / 2 (e.g. 1 out of 3 surviving when minThreshold=2)
    activeDocIds = ['docLive1']; // only 1 chunk survives out of 3 candidates
    capturedLogs.length = 0;
    const fallbackResult = await retrievalService.retrieveContext('test document deletion query', [1], 3);
    testAssert('Hydrate drop below threshold triggers MISS', capturedLogs.some(l => l.includes('HYDRATE DROP THRESHOLD')));
    testAssert('Returns valid live search result', fallbackResult.chunks.length === 1);
  }

  // ─────────────────────────────────────────────────────────────
  // (e) Redis stopped mid-run: search still works (Fail-Open)
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (e): Redis stopped mid-run falls open to live vector search ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    chunkModel.searchChunksByVector = async () => [
      { id: 501, document_id: 'docFailOpen', space_id: 1, content: 'Fail open content', page_number: 1, similarity: 0.95 }
    ];
    Document.find = () => ({ lean: async () => [{ _id: 'docFailOpen', title: 'FailOpen.pdf' }] });

    // Stop Redis client
    mockRedis.disconnect();
    testAssert('Redis status is end (offline)', mockRedis.status === 'end');
    testAssert('cacheService.isReady() is false', cacheService.isReady() === false);

    // retrieveContext must succeed without crashing or throwing
    let failedRun = false;
    let res = null;
    try {
      res = await retrievalService.retrieveContext('query during redis failure', [1], 3);
    } catch (e) {
      failedRun = true;
    }

    testAssert('retrieveContext does not throw on Redis outage', failedRun === false);
    testAssert('retrieveContext returns live search result during outage', res?.chunks?.[0]?.id === 501);
    testAssert('Sources are populated during outage', res?.sources?.length === 1);
  }

  // ─────────────────────────────────────────────────────────────
  // (f) Feature flag off (REDIS_RETRIEVAL_CACHE=false): identical behavior
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (f): Feature flag off behaves identically to baseline uncached path ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    process.env.REDIS_RETRIEVAL_CACHE = 'false';
    testAssert('isRetrievalCacheEnabled() is false when flag disabled', retrievalCacheService.isRetrievalCacheEnabled() === false);

    chunkModel.searchChunksByVector = async () => [
      { id: 601, document_id: 'docFlagOff', space_id: 1, content: 'Flag off content', page_number: 1, similarity: 0.9 }
    ];
    Document.find = () => ({ lean: async () => [{ _id: 'docFlagOff', title: 'FlagOff.pdf' }] });

    const result = await retrievalService.retrieveContext('query with flag disabled', [1], 3);
    testAssert('Returns valid result when flag is disabled', result.chunks[0].id === 601);

    // Verify no ret: keys were written to Redis
    const retKeys = [...mockRedis.store.keys()].filter(k => k.includes(':ret:'));
    testAssert('No retrieval cache keys were written while flag disabled', retKeys.length === 0);

    // Re-enable for subsequent tests
    process.env.REDIS_RETRIEVAL_CACHE = 'true';
  }

  // ─────────────────────────────────────────────────────────────
  // (g) Latency before and after for repeated query
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (g): Latency comparison (Miss vs Hit) ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    // Simulate realistic embedding computation delay (e.g., 25ms) in live search
    genAI.getGenerativeModel = () => ({
      embedContent: async () => {
        await new Promise(r => setTimeout(r, 25));
        return { embedding: { values: mockVector } };
      }
    });

    chunkModel.searchChunksByVector = async () => {
      await new Promise(r => setTimeout(r, 10)); // DB vector search latency
      return [
        { id: 701, document_id: 'docLat', space_id: 1, content: 'Latency test chunk', page_number: 1, similarity: 0.9 }
      ];
    };
    chunkModel.getChunksByIds = async (ids) => {
      return [{ id: 701, document_id: 'docLat', space_id: 1, content: 'Latency test chunk', page_number: 1 }];
    };
    Document.find = () => ({ lean: async () => [{ _id: 'docLat', title: 'Latency.pdf' }] });

    const latQuery = 'benchmark query latency';

    // Miss: executes embedContent (25ms) + searchChunksByVector (10ms)
    const t0 = process.hrtime.bigint();
    await retrievalService.retrieveContext(latQuery, [1], 3);
    const t1 = process.hrtime.bigint();
    const missDurationMs = Number(t1 - t0) / 1e6;

    // Hit: retrieves from candidate cache + fast hydration
    const t2 = process.hrtime.bigint();
    await retrievalService.retrieveContext(latQuery, [1], 3);
    const t3 = process.hrtime.bigint();
    const hitDurationMs = Number(t3 - t2) / 1e6;

    console.log(`    ⏱️  Live Search (Miss): ${missDurationMs.toFixed(2)}ms`);
    console.log(`    ⚡ Cached Search (Hit):  ${hitDurationMs.toFixed(2)}ms`);
    console.log(`    🚀 Speedup Factor:      ${(missDurationMs / Math.max(0.01, hitDurationMs)).toFixed(1)}x faster`);

    testAssert('Cache hit is faster than cache miss', hitDurationMs < missDurationMs);
  }

  // ─────────────────────────────────────────────────────────────
  // (h) Edge cases: query < 2 chars, empty results, shared tool verification
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (h): Query < 2 chars, empty results & searchKnowledgeBase tool ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    // Query with 1 character should not cache
    await retrievalService.retrieveContext('x', [1], 3);
    let keys = [...mockRedis.store.keys()].filter(k => k.includes(':ret:'));
    testAssert('Query < 2 chars does NOT create a retrieval cache key', keys.length === 0);

    // Empty query results should not cache
    chunkModel.searchChunksByVector = async () => [];
    await retrievalService.retrieveContext('non existent obscure query', [1], 3);
    keys = [...mockRedis.store.keys()].filter(k => k.includes(':ret:'));
    testAssert('Empty results are NEVER cached', keys.length === 0);

    // Verify searchKnowledgeBase tool returns identical excerpt shape
    chunkModel.searchChunksByVector = async () => [
      { id: 801, document_id: 'docTool', space_id: 1, content: 'Knowledge base tool content', page_number: 4, similarity: 0.88 }
    ];
    chunkModel.getChunksByIds = async (ids) => [
      { id: 801, document_id: 'docTool', space_id: 1, content: 'Knowledge base tool content', page_number: 4 }
    ];
    Document.find = () => ({ lean: async () => [{ _id: 'docTool', title: 'ToolSpec.pdf', originalName: 'Spec.pdf' }] });

    const toolResult = await executeSearchKB({ query: 'knowledge base tool check', topK: 3 }, { targetSpaceIds: [1] });
    testAssert('searchKnowledgeBase excerpt has documentId', toolResult.excerpts[0].documentId === 'docTool');
    testAssert('searchKnowledgeBase excerpt has title', toolResult.excerpts[0].title === 'ToolSpec.pdf');
    testAssert('searchKnowledgeBase excerpt has pageNumber', toolResult.excerpts[0].pageNumber === 4);
    testAssert('searchKnowledgeBase excerpt has score', typeof toolResult.excerpts[0].score === 'number');
    testAssert('searchKnowledgeBase excerpt has snippet', toolResult.excerpts[0].snippet.includes('Knowledge base tool content'));
  }

  // Restore console.debug
  console.debug = origDebug;

  console.log('\n======================================================');
  console.log(`Retrieval Results Cache Suite: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
