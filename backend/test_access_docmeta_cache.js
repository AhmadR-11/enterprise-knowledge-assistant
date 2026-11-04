// backend/test_access_docmeta_cache.js
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
}

async function runAccessAndDocMetaTests() {
  console.log('🧪 Starting R4 Access Cache & R5 Tool Result Cache Suite...\n');

  const { _setRedisClientForTesting } = require('./src/services/redis.client');
  const userSpaceModel = require('./src/models/postgres/userSpace.model');
  const userModel = require('./src/models/postgres/user.model');
  const Document = require('./src/models/mongo/Document.model');
  const spaceModel = require('./src/models/postgres/space.model');
  const pool = require('./src/config/db.postgres');

  const accessControlService = require('./src/services/accessControl.service');
  const { getUserAccess, resolveChatAccess, invalidateUserAccess, invalidateAllAccess, _resetLocalAccessVersionForTesting } = accessControlService;
  const getDocumentDetailsTool = require('./src/tools/getDocumentDetails.tool');
  const { execute: executeGetDocumentDetails, invalidateDocumentMetadata } = getDocumentDetailsTool;

  // ─────────────────────────────────────────────────────────────
  // (a) Second request for same user is an access-cache hit (log)
  // ─────────────────────────────────────────────────────────────
  {
    console.log('── Test (a): Second request is an access-cache HIT ──');
    process.env.REDIS_ENABLED = 'true';
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);
    _resetLocalAccessVersionForTesting();

    let dbQueryCount = 0;
    const originalListSpaces = userSpaceModel.listSpacesForUser;
    userSpaceModel.listSpacesForUser = async (userId) => {
      dbQueryCount++;
      return [5, 2, 8]; // un-sorted
    };

    const originalFindUserById = userModel.findUserById;
    userModel.findUserById = async (id) => ({ id, email: 'test@user.com', role: 'editor' });

    const debugLogs = [];
    const origDebug = console.debug;
    console.debug = (...msg) => {
      debugLogs.push(msg.join(' '));
      origDebug(...msg);
    };

    // First call -> MISS
    const access1 = await getUserAccess({ id: 10, role: 'editor' });
    testAssert('First access resolution queries DB', dbQueryCount === 1);
    testAssert('Space IDs are sorted in ascending order', JSON.stringify(access1.spaceIds) === JSON.stringify([2, 5, 8]));
    testAssert('Debug log recorded Cache MISS', debugLogs.some(l => l.includes('[AccessCache] MISS: user 10')));

    // Second call -> HIT
    const access2 = await getUserAccess({ id: 10, role: 'editor' });
    testAssert('Second access resolution does NOT query DB (count unchanged)', dbQueryCount === 1);
    testAssert('Cached access matches original', JSON.stringify(access1) === JSON.stringify(access2));
    testAssert('Debug log recorded Cache HIT', debugLogs.some(l => l.includes('[AccessCache] HIT: user 10')));

    // Verify TTL is <= 120s
    const ttl = mockRedis.ttl('access:v1:10');
    testAssert('Access cache entry has 120s TTL in Redis', ttl > 110 && ttl <= 120);

    console.debug = origDebug;
    userSpaceModel.listSpacesForUser = originalListSpaces;
    userModel.findUserById = originalFindUserById;
  }

  // ─────────────────────────────────────────────────────────────
  // (b) Removing user space assignment -> next request reflects new access
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (b): Removing space assignment invalidates cache immediately ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    let currentSpaces = [1, 2];
    userSpaceModel.listSpacesForUser = async () => currentSpaces;
    userModel.findUserById = async (id) => ({ id, role: 'editor' });

    // 1. Initial cached state
    const firstAccess = await getUserAccess({ id: 20, role: 'editor' });
    testAssert('Initial access has spaces [1, 2]', JSON.stringify(firstAccess.spaceIds) === JSON.stringify([1, 2]));

    // 2. Admin removes user from space 2
    currentSpaces = [1];
    await invalidateUserAccess(20);

    // 3. Very next request must reflect updated spaces [1]
    const nextAccess = await getUserAccess({ id: 20, role: 'editor' });
    testAssert('Next request immediately reflects updated spaces [1] (no stale access)', JSON.stringify(nextAccess.spaceIds) === JSON.stringify([1]));
  }

  // ─────────────────────────────────────────────────────────────
  // (c) Promoting/demoting a role -> next request reflects it
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (c): Promoting/demoting role reflects immediately ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    let currentRole = 'viewer';
    userModel.findUserById = async (id) => ({ id, role: currentRole });
    userSpaceModel.listSpacesForUser = async () => [1];

    // 1. Initial cached state (viewer)
    const initial = await getUserAccess({ id: 30, role: 'viewer' });
    testAssert('Initial role is viewer', initial.role === 'viewer');

    // 2. Admin promotes user to admin
    currentRole = 'admin';
    await invalidateUserAccess(30);

    // 3. Very next request reflects admin role
    const promoted = await getUserAccess({ id: 30, role: 'viewer' }); // Even if token has old role
    testAssert('Next request immediately reflects promoted admin role', promoted.role === 'admin');
    testAssert('Admin has unrestricted spaces list', promoted.spaceIds.length === 0);
  }

  // ─────────────────────────────────────────────────────────────
  // (d) Viewer cannot access document in space they lack, even if cached
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (d): Viewer denied access to document in unauthorized space despite cache ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    const docId = '507f1f77bcf86cd799439099';
    const originalFindById = Document.findById;
    Document.findById = (id) => ({
      lean: async () => ({
        _id: id,
        title: 'Executive Financials Q4.pdf',
        originalName: 'Financials.pdf',
        spaceId: 99, // In space 99
        mimeType: 'application/pdf',
        status: 'ready'
      })
    });

    // 1. Admin accesses document -> metadata is generated and cached in docmeta:<id>
    const adminUser = { id: 1, role: 'admin' };
    const adminRes = await executeGetDocumentDetails({ documentId: docId }, { user: adminUser });
    testAssert('Admin successfully retrieves document details', adminRes.success === true);
    testAssert('Document metadata is now cached in Redis', mockRedis.store.has('cortex:docmeta:' + docId));

    // 2. Viewer (assigned only to space 3, NOT space 99) attempts to access same document
    const viewerUser = { id: 2, role: 'viewer' };
    userSpaceModel.listSpacesForUser = async () => [3];
    userModel.findUserById = async (id) => ({ id, role: 'viewer' });

    const viewerRes = await executeGetDocumentDetails({ documentId: docId }, { user: viewerUser });

    testAssert('Viewer is DENIED access (404/NOT_FOUND)', viewerRes.error === 'NOT_FOUND');
    testAssert('Viewer does NOT receive cached title or metadata', viewerRes.title === undefined);
    testAssert('Cached metadata was protected by order-of-operations RBAC check', viewerRes.message === 'Document not found or access denied');

    Document.findById = originalFindById;
  }

  // ─────────────────────────────────────────────────────────────
  // (e) Deleting a document makes details return not-found immediately
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (e): Deleting a document returns not-found immediately ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    const docId = '507f1f77bcf86cd799439055';
    let docExistsInDb = true;

    Document.findById = (id) => ({
      lean: async () => {
        if (!docExistsInDb) return null;
        return {
          _id: id,
          title: 'Quarterly Report.pdf',
          originalName: 'Report.pdf',
          spaceId: 1,
          mimeType: 'application/pdf',
          status: 'ready'
        };
      }
    });

    userSpaceModel.listSpacesForUser = async () => [1];
    userModel.findUserById = async (id) => ({ id, role: 'editor' });

    // 1. Initial access -> caches metadata
    const res1 = await executeGetDocumentDetails({ documentId: docId }, { user: { id: 5, role: 'editor' } });
    testAssert('Initial document fetch succeeds and caches', res1.success === true);
    testAssert('docmeta key is stored in Redis', mockRedis.store.has('cortex:docmeta:' + docId));

    // 2. Document is deleted
    docExistsInDb = false;
    await invalidateDocumentMetadata(docId);
    testAssert('docmeta key was purged from Redis', !mockRedis.store.has('cortex:docmeta:' + docId));

    // 3. Next request immediately returns not found
    const res2 = await executeGetDocumentDetails({ documentId: docId }, { user: { id: 5, role: 'editor' } });
    testAssert('Next request immediately returns NOT_FOUND after deletion', res2.error === 'NOT_FOUND');
  }

  // ─────────────────────────────────────────────────────────────
  // (f) Behavior with REDIS_ENABLED=false is identical
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (f): REDIS_ENABLED=false behaves identically ──');
    process.env.REDIS_ENABLED = 'false';
    _setRedisClientForTesting(null);

    userSpaceModel.listSpacesForUser = async () => [1, 2];
    userModel.findUserById = async (id) => ({ id, role: 'editor' });

    const chatAccess = await resolveChatAccess({ id: 40, role: 'editor' }, '2');
    testAssert('resolveChatAccess works seamlessly without Redis', JSON.stringify(chatAccess.targetSpaceIds) === JSON.stringify([2]));

    Document.findById = (id) => ({
      lean: async () => ({
        _id: id,
        title: 'Uncached Doc.pdf',
        originalName: 'Uncached.pdf',
        spaceId: 1,
        mimeType: 'application/pdf',
        status: 'ready'
      })
    });

    const docDetails = await executeGetDocumentDetails(
      { documentId: '507f1f77bcf86cd799439077' },
      { user: { id: 40, role: 'editor' } }
    );
    testAssert('executeGetDocumentDetails works seamlessly without Redis', docDetails.success === true && docDetails.title === 'Uncached Doc.pdf');
  }

  // ─────────────────────────────────────────────────────────────
  // (g) Redis stopped mid-run: everything still works (Fail-Open)
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (g): Redis stopped mid-run (Fail-Open) ──');
    process.env.REDIS_ENABLED = 'true';
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    // Simulate sudden Redis connection loss
    mockRedis.simulateDisconnect();

    userSpaceModel.listSpacesForUser = async () => [1, 2];
    userModel.findUserById = async (id) => ({ id, role: 'editor' });

    let chatAccessDowntime;
    try {
      chatAccessDowntime = await resolveChatAccess({ id: 50, role: 'editor' }, '1');
    } catch (e) {
      chatAccessDowntime = null;
    }
    testAssert('resolveChatAccess fails open and resolves access during Redis outage', chatAccessDowntime?.targetSpaceIds?.[0] === 1);

    let docDetailsDowntime;
    try {
      docDetailsDowntime = await executeGetDocumentDetails(
        { documentId: '507f1f77bcf86cd799439077' },
        { user: { id: 50, role: 'editor' } }
      );
    } catch (e) {
      docDetailsDowntime = null;
    }
    testAssert('executeGetDocumentDetails fails open and returns metadata during Redis outage', docDetailsDowntime?.success === true);
  }

  // ─────────────────────────────────────────────────────────────
  // Bulk Invalidation: invalidateAllAccess() bumps access:version
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (h): Bulk Invalidation bumps access:version ──');
    process.env.REDIS_ENABLED = 'true';
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);
    _resetLocalAccessVersionForTesting();

    userSpaceModel.listSpacesForUser = async () => [10];
    userModel.findUserById = async (id) => ({ id, role: 'editor' });

    // Cache access under version 1
    await getUserAccess({ id: 60, role: 'editor' });
    testAssert('User access cached under version 1 key (cortex:access:v1:60)', mockRedis.store.has('cortex:access:v1:60'));

    // Space deleted -> bulk invalidation
    await invalidateAllAccess();

    let dbCalled = false;
    userSpaceModel.listSpacesForUser = async () => {
      dbCalled = true;
      return [10];
    };

    // Next request checks version 2
    await getUserAccess({ id: 60, role: 'editor' });
    testAssert('Next access request incurs cache MISS and queries DB after bulk invalidation', dbCalled === true);
    testAssert('New access cached under version 2 key (cortex:access:v2:60)', mockRedis.store.has('cortex:access:v2:60'));
  }

  console.log(`\n======================================================`);
  console.log(`Access & DocMeta Cache Suite Results: ${passed} passed, ${failed} failed`);
  console.log(`======================================================\n`);

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runAccessAndDocMetaTests().catch((err) => {
  console.error('Unhandled failure in Access & DocMeta Cache Suite:', err);
  process.exit(1);
});

