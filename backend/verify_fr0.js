// verify_fr0.js - Run from the /backend directory: node verify_fr0.js
// Tests FR-0.1 through FR-0.6 end-to-end

require('dotenv').config();

const connectMongo = require('./src/config/db.mongo');
const postgresPool = require('./src/config/db.postgres');
const app = require('./src/app');

const PORT = 5555;
const BASE_URL = `http://localhost:${PORT}/api`;

const TEST_EMAILS = {
  admin:      'admin_test@verify.com',
  editor:     'editor_test@verify.com',
  viewer:     'viewer_test@verify.com',
  unassigned: 'unassigned_test@verify.com'
};

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

async function cleanDatabase() {
  await postgresPool.query(
    `DELETE FROM users WHERE email = ANY($1::text[])`,
    [Object.values(TEST_EMAILS)]
  );
  await postgresPool.query(`DELETE FROM spaces WHERE name = $1`, ['Verify Department']);
}

async function runTests() {
  let server;
  try {
    console.log('🔌 Connecting to databases...');
    await connectMongo();
    const pgTest = await postgresPool.query('SELECT NOW()');
    console.log('   PostgreSQL ✅ connected at:', pgTest.rows[0].now);
    console.log('   MongoDB    ✅ connected\n');

    await cleanDatabase();

    server = app.listen(PORT);
    console.log(`🚀 Test server on port ${PORT}\n`);

    // ─────────────────────────────────────────────
    // FR-0.1 | User Registration & Login via email/password
    // FR-0.3 | Three roles: admin, editor, viewer
    // ─────────────────────────────────────────────
    console.log('══ FR-0.1 / FR-0.3 — Registration & Roles ══');

    const adminReg = await (await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAILS.admin, password: 'Admin@1234', role: 'admin' })
    })).json();
    assert('Admin registers successfully (201)', adminReg.success === true);
    assert('Response contains JWT token', !!adminReg.data?.token);
    assert('Returned role is "admin"', adminReg.data?.user?.role === 'admin');

    await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAILS.editor, password: 'Editor@1234', role: 'editor' })
    });
    await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAILS.viewer, password: 'Viewer@1234', role: 'viewer' })
    });
    await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAILS.unassigned, password: 'Unassign@1234', role: 'viewer' })
    });

    // Duplicate email must be rejected
    const dupRegRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAILS.admin, password: 'Admin@1234', role: 'admin' })
    });
    assert('Duplicate email registration rejected (400)', dupRegRes.status === 400);

    // Invalid role must be rejected
    const badRoleRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'badrole@verify.com', password: 'test1234', role: 'superadmin' })
    });
    assert('Invalid role rejected (400)', badRoleRes.status === 400);

    // ─────────────────────────────────────────────
    // FR-0.2 | JWT token issuance & validation
    // ─────────────────────────────────────────────
    console.log('\n══ FR-0.2 — JWT Issuance & Validation ══');

    const adminLogin = await (await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAILS.admin, password: 'Admin@1234' })
    })).json();
    assert('Admin login succeeds (200)', adminLogin.success === true);
    assert('Admin login returns JWT', !!adminLogin.data?.token);
    const adminToken = adminLogin.data.token;

    const badPassRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAILS.admin, password: 'wrongpassword' })
    });
    assert('Wrong password rejected (401)', badPassRes.status === 401);

    const noUserRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ghost@verify.com', password: 'abc123' })
    });
    assert('Non-existent user rejected (401)', noUserRes.status === 401);

    // Invalid token test
    const fakeTokenRes = await fetch(`${BASE_URL}/spaces/my`, {
      headers: { 'Authorization': 'Bearer this.is.fake' }
    });
    assert('Invalid JWT rejected (401)', fakeTokenRes.status === 401);

    // No token test
    const noTokenRes = await fetch(`${BASE_URL}/spaces/my`);
    assert('No JWT rejected (401)', noTokenRes.status === 401);

    // Login remaining users
    const editorLogin = await (await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAILS.editor, password: 'Editor@1234' })
    })).json();
    const editorToken = editorLogin.data.token;
    const editorId = editorLogin.data.user.id;

    const viewerLogin = await (await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAILS.viewer, password: 'Viewer@1234' })
    })).json();
    const viewerToken = viewerLogin.data.token;

    const unassignedLogin = await (await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAILS.unassigned, password: 'Unassign@1234' })
    })).json();
    const unassignedToken = unassignedLogin.data.token;

    // ─────────────────────────────────────────────
    // FR-0.4 | Spaces as unit of access control
    // FR-0.5 | Permissions enforced at API/DB layer
    // FR-0.3 | RBAC roles checked
    // ─────────────────────────────────────────────
    console.log('\n══ FR-0.3 / FR-0.4 / FR-0.5 — Spaces, RBAC, & DB-layer enforcement ══');

    // Admin can create space
    const createSpaceRes = await (await fetch(`${BASE_URL}/spaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Verify Department', description: 'FR-0 test space' })
    })).json();
    assert('Admin creates space successfully', createSpaceRes.success === true);
    const spaceId = createSpaceRes.data?.id;
    assert('Space returned with ID', typeof spaceId === 'number');

    // Editor cannot create space (role check at API layer — not just UI)
    const editorCreateSpace = await fetch(`${BASE_URL}/spaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${editorToken}` },
      body: JSON.stringify({ name: 'Editor Space' })
    });
    assert('Editor forbidden from creating space (403)', editorCreateSpace.status === 403);

    // Viewer cannot create space
    const viewerCreateSpace = await fetch(`${BASE_URL}/spaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${viewerToken}` },
      body: JSON.stringify({ name: 'Viewer Space' })
    });
    assert('Viewer forbidden from creating space (403)', viewerCreateSpace.status === 403);

    // Before assignment: editor has no spaces
    const editorSpacesBefore = await (await fetch(`${BASE_URL}/spaces/my`, {
      headers: { 'Authorization': `Bearer ${editorToken}` }
    })).json();
    assert('Editor has no spaces before assignment', editorSpacesBefore.data?.spaces?.length === 0);

    // Admin assigns editor to space
    const assignRes = await fetch(`${BASE_URL}/spaces/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ userId: editorId, spaceId })
    });
    assert('Admin assigns editor to space (200)', assignRes.status === 200);

    // After assignment: editor sees the space
    const editorSpacesAfter = await (await fetch(`${BASE_URL}/spaces/my`, {
      headers: { 'Authorization': `Bearer ${editorToken}` }
    })).json();
    assert('Editor sees assigned space after assignment', editorSpacesAfter.data?.spaces?.length === 1);

    // Admin sees all spaces regardless of membership
    const adminSpaces = await (await fetch(`${BASE_URL}/spaces/my`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    })).json();
    assert('Admin sees all spaces', adminSpaces.data?.spaces?.length >= 1);

    // Space access: assigned editor can list space users (DB layer check)
    const editorAccess = await fetch(`${BASE_URL}/spaces/${spaceId}/users`, {
      headers: { 'Authorization': `Bearer ${editorToken}` }
    });
    assert('Assigned editor can access space users (200)', editorAccess.status === 200);

    // Space access: UNASSIGNED viewer is blocked (enforced at DB layer in middleware)
    const unassignedAccess = await fetch(`${BASE_URL}/spaces/${spaceId}/users`, {
      headers: { 'Authorization': `Bearer ${unassignedToken}` }
    });
    assert('Unassigned viewer blocked from space users (403)', unassignedAccess.status === 403);

    // Space access: admin bypasses membership check
    const adminAccess = await fetch(`${BASE_URL}/spaces/${spaceId}/users`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert('Admin bypasses space membership check (200)', adminAccess.status === 200);

    // ─────────────────────────────────────────────
    // FR-0.6 | Auth attempt logging in MongoDB
    // ─────────────────────────────────────────────
    console.log('\n══ FR-0.6 — Audit Log of Auth Attempts ══');

    const auditRes = await (await fetch(`${BASE_URL}/audit`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    })).json();
    assert('Admin can fetch audit logs (200)', auditRes.success === true);
    assert('Audit logs array is non-empty', auditRes.data?.logs?.length > 0);

    const actions = auditRes.data.logs.map(l => l.action);
    assert('AUTH_LOGIN_SUCCESS logged', actions.some(a => a === 'AUTH_LOGIN_SUCCESS'));
    assert('AUTH_LOGIN_FAILURE logged', actions.some(a => a === 'AUTH_LOGIN_FAILURE'));
    assert('AUTH_REGISTER_SUCCESS logged', actions.some(a => a === 'AUTH_REGISTER_SUCCESS'));

    // Viewer cannot access audit logs (non-admin blocked)
    const viewerAudit = await fetch(`${BASE_URL}/audit`, {
      headers: { 'Authorization': `Bearer ${viewerToken}` }
    });
    assert('Viewer forbidden from audit logs (403)', viewerAudit.status === 403);

    // ─────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────
    console.log('\n═══════════════════════════════');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Total:    ${passed + failed}`);
    console.log('═══════════════════════════════');

  } catch (err) {
    console.error('💥 Unexpected test error:', err);
  } finally {
    if (server) server.close();
    await postgresPool.end();
    const mongoose = require('mongoose');
    await mongoose.connection.close();
    console.log('\n🔌 Connections closed. Done.');
  }
}

runTests();
