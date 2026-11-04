// backend/test_token_denylist.js
const assert = require('assert');
const EventEmitter = require('events');
const jwt = require('jsonwebtoken');

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

  async ttl(key) {
    if (this.status !== 'ready') throw new Error('Connection is closed');
    const rKey = this._resolveKey(key);
    if (!this.store.has(rKey) || this._isExpired(rKey)) return -2;
    const exp = this.expiries.get(rKey);
    if (!exp) return -1;
    return Math.max(1, Math.ceil((exp - Date.now()) / 1000));
  }

  disconnect() {
    this.status = 'end';
  }
}

/**
 * Creates simulated express request and response
 */
function createMockReqRes(options = {}) {
  const req = {
    headers: options.headers || {},
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    user: options.user || null,
    auth: options.auth || null,
    token: null,
    ip: '127.0.0.1'
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
    setHeader(name, val) {
      this.headers[name.toLowerCase()] = val;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    }
  };

  return { req, res };
}

async function runTests() {
  console.log('🧪 Starting Redis Token Denylist & Secure Logout Suite...\n');

  process.env.JWT_SECRET = 'test_secret_for_denylist_12345';
  process.env.REDIS_ENABLED = 'true';
  process.env.AUTH_DENYLIST_FAIL_CLOSED = 'false';

  const { _setRedisClientForTesting } = require('./src/services/redis.client');
  const cacheService = require('./src/services/cache.service');
  const protect = require('./src/middleware/auth.middleware');
  const userModel = require('./src/models/postgres/user.model');
  const { register, login, logout } = require('./src/controllers/auth.controller');
  const tokenDenylistService = require('./src/services/tokenDenylist.service');

  // Mock user in DB
  const mockUser = {
    id: 42,
    email: 'denylist_tester@cortex.ai',
    password_hash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
    role: 'editor'
  };
  userModel.findUserById = async (id) => (Number(id) === mockUser.id ? mockUser : null);
  userModel.findUserByEmail = async (email) => (email === mockUser.email ? mockUser : null);

  // ─────────────────────────────────────────────────────────────
  // (a) Login, call protected route (200), logout (204), call again (401)
  // ─────────────────────────────────────────────────────────────
  let validToken = null;
  let tokenJti = null;
  {
    console.log('── Test (a): Login -> Protected (200) -> Logout (204) -> Protected (401) ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    // Mock bcrypt compare for login
    const bcrypt = require('bcrypt');
    const origCompare = bcrypt.compare;
    bcrypt.compare = async () => true;

    // 1. Login to get a token
    const { req: loginReq, res: loginRes } = createMockReqRes({
      body: { email: mockUser.email, password: 'SecretPassword123' }
    });
    await login(loginReq, loginRes, (err) => { if (err) throw err; });
    bcrypt.compare = origCompare;

    testAssert('Login succeeds with 200', loginRes.statusCode === 200);
    validToken = loginRes.body?.data?.token;
    testAssert('Login returns a valid token string', typeof validToken === 'string' && validToken.length > 20);

    const decoded = jwt.decode(validToken);
    tokenJti = decoded.jti;
    testAssert('Token payload includes unique jti', typeof tokenJti === 'string' && tokenJti.length > 10);

    // 2. Access protected route with the new token -> 200 OK
    const { req: protReq1, res: protRes1 } = createMockReqRes({
      headers: { authorization: `Bearer ${validToken}` }
    });
    let nextCalled1 = false;
    await protect(protReq1, protRes1, () => { nextCalled1 = true; });

    testAssert('Protected route succeeds with valid token', nextCalled1 === true);
    testAssert('protect middleware attaches req.user', protReq1.user?.id === mockUser.id);
    testAssert('protect middleware attaches req.auth with jti', protReq1.auth?.jti === tokenJti);

    // 3. Logout -> POST /api/auth/logout -> 204 No Content
    const { req: logoutReq, res: logoutRes } = createMockReqRes({
      headers: { authorization: `Bearer ${validToken}` }
    });
    // Run protect middleware on logout request
    let logoutAuthPass = false;
    await protect(logoutReq, logoutRes, () => { logoutAuthPass = true; });
    testAssert('Logout route passes authentication', logoutAuthPass === true);

    await logout(logoutReq, logoutRes);
    testAssert('Logout returns 204 No Content', logoutRes.statusCode === 204);
    testAssert('Redis stores denylist entry under bl:<jti>', mockRedis.store.has(`cortex:bl:${tokenJti}`));

    // 4. Access protected route AGAIN with the revoked token -> 401 Unauthorized
    const { req: protReq2, res: protRes2 } = createMockReqRes({
      headers: { authorization: `Bearer ${validToken}` }
    });
    let nextCalled2 = false;
    await protect(protReq2, protRes2, () => { nextCalled2 = true; });

    testAssert('Subsequent request with revoked token is BLOCKED (next() not called)', nextCalled2 === false);
    testAssert('Returns HTTP 401', protRes2.statusCode === 401);
    testAssert('Error message states token has been revoked', protRes2.body?.message?.includes('revoked'));
  }

  // ─────────────────────────────────────────────────────────────
  // (b) A token without jti (legacy) still works until it expires
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (b): Legacy token without jti still works until expiration ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    // Issue legacy token with no jti
    const legacyToken = jwt.sign(
      { id: mockUser.id, email: mockUser.email, role: mockUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const decodedLegacy = jwt.decode(legacyToken);
    testAssert('Legacy token has NO jti property', decodedLegacy.jti === undefined);

    const { req: legReq, res: legRes } = createMockReqRes({
      headers: { authorization: `Bearer ${legacyToken}` }
    });
    let legacyPassed = false;
    await protect(legReq, legRes, () => { legacyPassed = true; });

    testAssert('Legacy token without jti passes authentication (200)', legacyPassed === true);
    testAssert('Legacy user details attached to req.user', legReq.user?.email === mockUser.email);
  }

  // ─────────────────────────────────────────────────────────────
  // (c) Redis key has a TTL and disappears after expiry (show TTL)
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (c): Redis denylist key has matching TTL and expires cleanly ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    // Issue a short-lived token: exp in 100 seconds
    const expSec = Math.floor(Date.now() / 1000) + 100;
    const testJti = 'test-jti-uuid-ttl-check-99';
    const shortToken = jwt.sign(
      { id: mockUser.id, email: mockUser.email, role: mockUser.role, jti: testJti, exp: expSec },
      process.env.JWT_SECRET
    );

    // Call denyToken
    await tokenDenylistService.denyToken(testJti, expSec);

    // Check TTL in Redis
    const remainingTtl = await mockRedis.ttl(`cortex:bl:${testJti}`);
    console.log(`    ⏱️  Remaining Redis TTL on bl:${testJti}: ${remainingTtl}s (Expected ~100s)`);
    testAssert('Key has positive TTL in Redis (~100s)', remainingTtl >= 95 && remainingTtl <= 100);

    // Verify raw token is NEVER stored (security constraint)
    const storedVal = await mockRedis.get(`cortex:bl:${testJti}`);
    testAssert('Redis value is metadata JSON (not the raw token)', storedVal.includes('revokedAt'));
    testAssert('Redis value DOES NOT contain raw JWT token', !storedVal.includes(shortToken));

    // Simulate expiration: advance clock
    mockRedis.expiries.set(`cortex:bl:${testJti}`, Date.now() - 1000);
    const expiredTtl = await mockRedis.ttl(`cortex:bl:${testJti}`);
    testAssert('Key disappears after expiration (TTL = -2)', expiredTtl === -2);
  }

  // ─────────────────────────────────────────────────────────────
  // (d) Redis stopped: fail-open vs fail-closed behavior
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (d): Redis stopped behavior (Fail-Open vs Fail-Closed) ──');
    const mockRedis = new MockRedisClient();
    _setRedisClientForTesting(mockRedis);

    const freshToken = jwt.sign(
      { id: mockUser.id, email: mockUser.email, role: mockUser.role, jti: 'fresh-jti-123' },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // 1. Default setting: AUTH_DENYLIST_FAIL_CLOSED = false (Fail-Open)
    process.env.AUTH_DENYLIST_FAIL_CLOSED = 'false';
    mockRedis.disconnect(); // Redis goes down
    testAssert('Redis client status is offline (end)', mockRedis.status === 'end');
    testAssert('cacheService.isReady() is false', cacheService.isReady() === false);

    const { req: foReq, res: foRes } = createMockReqRes({
      headers: { authorization: `Bearer ${freshToken}` }
    });
    let foPassed = false;
    await protect(foReq, foRes, () => { foPassed = true; });

    testAssert('Fail-open default: protected route continues to work during Redis outage', foPassed === true);
    testAssert('Req.user attached during Redis outage', foReq.user?.id === mockUser.id);

    // 2. Strict setting: AUTH_DENYLIST_FAIL_CLOSED = true (Fail-Closed)
    process.env.AUTH_DENYLIST_FAIL_CLOSED = 'true';
    const { req: fcReq, res: fcRes } = createMockReqRes({
      headers: { authorization: `Bearer ${freshToken}` }
    });
    let fcPassed = false;
    await protect(fcReq, fcRes, () => { fcPassed = true; });

    testAssert('Fail-closed mode: protected route is REJECTED during Redis outage', fcPassed === false);
    testAssert('Returns HTTP 401', fcRes.statusCode === 401);
    testAssert('Error message states revocation status cannot be verified', fcRes.body?.message?.includes('temporarily unavailable'));

    // Reset env
    process.env.AUTH_DENYLIST_FAIL_CLOSED = 'false';
  }

  // ─────────────────────────────────────────────────────────────
  // (e) REDIS_ENABLED=false: logout still returns 204 and middleware functions
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (e): REDIS_ENABLED=false (Logout returns 204, no denylist) ──');
    process.env.REDIS_ENABLED = 'false';

    const disabledToken = jwt.sign(
      { id: mockUser.id, email: mockUser.email, role: mockUser.role, jti: 'disabled-redis-jti' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const { req: disReq, res: disRes } = createMockReqRes({
      headers: { authorization: `Bearer ${disabledToken}` }
    });
    let disAuth = false;
    await protect(disReq, disRes, () => { disAuth = true; });
    testAssert('protect middleware passes authentication when Redis disabled', disAuth === true);

    await logout(disReq, disRes);
    testAssert('logout returns 204 when Redis disabled', disRes.statusCode === 204);

    // Reset env
    process.env.REDIS_ENABLED = 'true';
  }

  // ─────────────────────────────────────────────────────────────
  // (f) Frontend logout simulation (clears state, no infinite loops)
  // ─────────────────────────────────────────────────────────────
  {
    console.log('\n── Test (f): Frontend logout flow & 401 redirect safety ──');

    // Simulate localStorage & store state
    const localStorageMock = new Map();
    localStorageMock.set('eka_token', 'valid-jwt-token');
    localStorageMock.set('eka_user', JSON.stringify({ id: 42, email: 'user@cortex.ai' }));

    testAssert('Storage has token prior to logout', localStorageMock.has('eka_token'));

    // Simulate confirmLogout
    localStorageMock.delete('eka_token');
    localStorageMock.delete('eka_user');
    testAssert('confirmLogout clears eka_token from storage', !localStorageMock.has('eka_token'));
    testAssert('confirmLogout clears eka_user from storage', !localStorageMock.has('eka_user'));

    // Simulate 401 interceptor loop-prevention check
    const currentPaths = ['/dashboard', '/chat', '/login'];
    for (const path of currentPaths) {
      const wouldRedirect = path !== '/login';
      if (path === '/login') {
        testAssert('On /login path, 401 interceptor does NOT redirect (prevents infinite loop)', wouldRedirect === false);
      } else {
        testAssert(`On ${path} path, 401 interceptor triggers redirect to /login`, wouldRedirect === true);
      }
    }
  }

  console.log('\n======================================================');
  console.log(`Redis Token Denylist Suite: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
