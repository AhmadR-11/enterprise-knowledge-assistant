// seed.js — Seeds Admin and Viewer accounts, Spaces, and Sample Documents with pgvector chunks
// Usage:
//   node seed.js          -> Ensures accounts, spaces, and sample documents exist
//   node seed.js --clean  -> Clears existing data first, then seeds a fresh demo environment

require('dotenv').config();
const mongoose     = require('mongoose');
const connectMongo = require('./src/config/db.mongo');
const pool         = require('./src/config/db.postgres');
const bcrypt       = require('bcrypt');
const genAI        = require('./src/config/gemini');
const Document     = require('./src/models/mongo/Document.model');

const ACCOUNTS = [
  { email: 'admin@company.com',  password: 'admin@1234',  role: 'admin' },
  { email: 'viewer@company.com', password: 'viewer@1234', role: 'viewer' },
  { email: 'editor@company.com', password: 'editor@1234', role: 'editor' }
];

const SPACES = [
  {
    name: 'Engineering & Architecture',
    description: 'Shared technical workspace accessible by Engineering and Viewers'
  },
  {
    name: 'Executive & Confidential',
    description: 'Restricted executive workspace for internal finances and leadership policies'
  }
];

const SAMPLE_DOCS = [
  {
    title: 'System Architecture & Scaling Principles',
    originalName: 'System_Architecture_Guide.pdf',
    spaceName: 'Engineering & Architecture',
    tags: ['architecture', 'pgvector', 'scaling'],
    description: 'Core design documentation on PostgreSQL pooling, pgvector, and microservices.',
    chunks: [
      {
        pageNumber: 1,
        content: `Cortex Enterprise Knowledge Assistant Architecture Overview:
The Cortex backend is built on Express.js and communicates with a hybrid database tier.
PostgreSQL with pgvector stores high-dimensional 768-dim embeddings generated via gemini-embedding-001.
Connection pooling is managed via pg-pool with strict SSL termination and connection timeouts.
Database sharding and read replicas ensure sub-50ms vector query execution across millions of chunks.`
      },
      {
        pageNumber: 2,
        content: `Agentic Tool Calling & Retrieval Mechanics:
Incoming queries pass through resolveChatAccess which binds authenticated user credentials to space IDs.
Gemini evaluates the query and invokes searchKnowledgeBase when domain knowledge is required.
Retrieval uses cosine distance (1 - (embedding <=> query_vector)) filtered by space_id = ANY(targetSpaceIds).
A bounded loop of 3 iterations prevents runaway LLM execution.`
      }
    ]
  },
  {
    title: 'Cortex Deployment & Operations Guide',
    originalName: 'Cortex_Deployment_Guide.pdf',
    spaceName: 'Engineering & Architecture',
    tags: ['devops', 'redis', 'operations'],
    description: 'Operational guidelines, Redis fail-open architecture, and environment configuration.',
    chunks: [
      {
        pageNumber: 1,
        content: `Redis Foundation and Fail-Open High Availability:
Cortex includes an optional Redis tier for query embedding caching, access permission memoization, and chat history.
All Redis helper operations (getJSON, setJSON, incr, del) are strictly fail-open with short 150ms command timeouts.
If Redis experiences downtime, the system falls back directly to PostgreSQL without crashing or rejecting queries.
Token revocation uses a Redis denylist under bl:<jti> with TTL matched to token expiration.`
      }
    ]
  },
  {
    title: 'Executive Compensation & Q4 Financials',
    originalName: 'Executive_Compensation_2026.pdf',
    spaceName: 'Executive & Confidential',
    tags: ['confidential', 'executive', 'hr'],
    description: 'CONFIDENTIAL: Internal salary bands, executive bonuses, and Q4 revenue allocation.',
    chunks: [
      {
        pageNumber: 1,
        content: `CONFIDENTIAL EXECUTIVE COMPENSATION POLICY:
This document contains proprietary compensation structures restricted strictly to executive leadership.
Annual executive bonuses for Q4 are pegged at 35% of EBITDA margin outperformance.
Equity grant vesting schedules follow a 4-year linear model with a 1-year cliff.
Under no circumstances may this information be distributed outside the Executive & Confidential space.`
      }
    ]
  }
];

async function generateEmbeddingSafely(text) {
  try {
    if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('YourGeminiApiKey')) {
      const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
      const res = await model.embedContent({
        content: { parts: [{ text }] },
        outputDimensionality: 768
      });
      return res.embedding.values;
    }
  } catch (err) {
    // Fall back to deterministic vector
  }
  // Deterministic normalized mock vector of length 768
  const vec = new Array(768).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % 768] = (vec[i % 768] + text.charCodeAt(i) / 1000) % 1;
  }
  return vec;
}

async function cleanAll() {
  console.log('🧹 Cleaning existing data from databases...');
  await pool.query('DELETE FROM messages').catch(() => {});
  await pool.query('DELETE FROM conversations').catch(() => {});
  await pool.query('DELETE FROM document_chunks').catch(() => {});
  await pool.query('DELETE FROM user_spaces').catch(() => {});
  await pool.query('DELETE FROM spaces').catch(() => {});
  await pool.query('DELETE FROM users').catch(() => {});
  console.log('   ✅ PostgreSQL: messages, conversations, document_chunks, user_spaces, spaces, users cleared');

  if (mongoose.connection?.db) {
    await mongoose.connection.db.collection('documents').deleteMany({});
    await mongoose.connection.db.collection('auditlogs').deleteMany({});
    console.log('   ✅ MongoDB: documents and auditlogs collections cleared');
  }
}

async function seed() {
  const shouldClean = process.argv.includes('--clean');
  console.log(shouldClean ? '🔄 Full Database Reset & Seed...' : '🌱 Seeding demo environment...');

  await connectMongo();
  await pool.query('SELECT 1');

  try {
    if (shouldClean) {
      await cleanAll();
    }

    // 1. Create or ensure accounts exist
    const createdUsers = {};
    for (const acc of ACCOUNTS) {
      const hash = await bcrypt.hash(acc.password, 10);
      const existing = await pool.query('SELECT id, email, role FROM users WHERE email = $1', [acc.email]);
      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE users SET password_hash = $1, role = $2 WHERE email = $3`,
          [hash, acc.role, acc.email]
        );
        createdUsers[acc.email] = existing.rows[0];
      } else {
        const { rows } = await pool.query(
          `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role`,
          [acc.email, hash, acc.role]
        );
        createdUsers[acc.email] = rows[0];
        console.log(`✅ Created ${acc.role.toUpperCase()}: ${acc.email}`);
      }
    }

    // 2. Create Spaces
    const spaceMap = {};
    for (const s of SPACES) {
      const existing = await pool.query('SELECT id, name FROM spaces WHERE name = $1', [s.name]);
      if (existing.rows.length > 0) {
        spaceMap[s.name] = existing.rows[0].id;
      } else {
        const { rows } = await pool.query(
          `INSERT INTO spaces (name, description) VALUES ($1, $2) RETURNING id, name`,
          [s.name, s.description]
        );
        spaceMap[s.name] = rows[0].id;
        console.log(`✅ Created Space: "${s.name}" (ID: ${rows[0].id})`);
      }
    }

    // 3. Assign Space Access (RBAC)
    // Admin: access to all spaces automatically
    // Viewer & Editor: assigned ONLY to "Engineering & Architecture"
    const engSpaceId = spaceMap['Engineering & Architecture'];
    for (const email of ['viewer@company.com', 'editor@company.com']) {
      const user = createdUsers[email];
      if (user && engSpaceId) {
        await pool.query(
          `INSERT INTO user_spaces (user_id, space_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [user.id, engSpaceId]
        );
        console.log(`🔗 Assigned ${user.email} to "Engineering & Architecture"`);
      }
    }

    // 4. Seed Sample Documents & Chunks with Vectors
    const adminUser = createdUsers['admin@company.com'];
    for (const docSpec of SAMPLE_DOCS) {
      const sId = spaceMap[docSpec.spaceName];
      const existingDoc = await Document.findOne({ title: docSpec.title, spaceId: sId });
      let docRecord = existingDoc;

      if (!existingDoc) {
        docRecord = await Document.create({
          title: docSpec.title,
          originalName: docSpec.originalName,
          description: docSpec.description,
          tags: docSpec.tags,
          mimeType: 'application/pdf',
          spaceId: sId,
          uploadedBy: adminUser.id,
          status: 'ready',
          chunkCount: docSpec.chunks.length
        });
        console.log(`📄 Created Document: "${docSpec.title}" in Space ${sId}`);

        // Insert chunks into PostgreSQL
        for (let idx = 0; idx < docSpec.chunks.length; idx++) {
          const chunk = docSpec.chunks[idx];
          const embedding = await generateEmbeddingSafely(chunk.content);
          await pool.query(
            `INSERT INTO document_chunks (document_id, space_id, content, embedding, page_number, chunk_index)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              docRecord._id.toString(),
              sId,
              chunk.content,
              JSON.stringify(embedding),
              chunk.pageNumber,
              idx
            ]
          );
        }
        console.log(`   └─ Inserted ${docSpec.chunks.length} pgvector chunks`);
      }
    }

    console.log('\n======================================================');
    console.log('🎉 DEMO ENVIRONMENT READY');
    console.log('======================================================');
    console.log('👤 TEST USERS:');
    console.log('   🛡️  ADMIN:  admin@company.com  / admin@1234  (Access: ALL Spaces)');
    console.log('   👁️  VIEWER: viewer@company.com / viewer@1234 (Access: "Engineering & Architecture" ONLY)\n');
    console.log('🏢 SPACES:');
    console.log(`   1. "Engineering & Architecture" (ID: ${spaceMap['Engineering & Architecture']})`);
    console.log(`   2. "Executive & Confidential"   (ID: ${spaceMap['Executive & Confidential']}) [RESTRICTED]\n`);
    console.log('💬 6 DEMO QUESTIONS TO SHOWCASE FULL CAPABILITIES:');
    console.log('   1. Tool Call + Citations:');
    console.log('      "How does Cortex handle database connection pooling and sharding?"');
    console.log('      -> Triggers searchKnowledgeBase, renders tool activity pills, and displays citations.\n');
    console.log('   2. Greeting (No Tools):');
    console.log('      "Hello! Who are you and what spaces can you search?"');
    console.log('      -> Streams immediate greeting without triggering any tool calls.\n');
    console.log('   3. RBAC Access Control Isolation:');
    console.log('      "What are the executive bonuses and compensation percentages for Q4?"');
    console.log('      -> As VIEWER: Returns 0 results / polite refusal (confidential space blocked).');
    console.log('      -> As ADMIN: Returns grounded answer with citations from Executive Compensation doc.\n');
    console.log('   4. Stop Mid-Stream:');
    console.log('      "Explain in extreme detail the full deployment guide and Redis fail-open design."');
    console.log('      -> Click "Stop" button mid-generation; stream aborts and partial answer is retained.\n');
    console.log('   5. Error Handling & Retry:');
    console.log('      Disconnect network or send malformed request.');
    console.log('      -> Renders inline error card with accessible "Retry" button.\n');
    console.log('   6. Multi-Turn Chat Persistence & Cache:');
    console.log('      Ask a follow-up: "Can you summarize the second point you just made?"');
    console.log('      -> Demonstrates multi-turn conversation memory, Redis history cache hit, and persistent sidebar.');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Seeding error:', err.message);
  } finally {
    await pool.end();
    if (mongoose?.connection) {
      await mongoose.connection.close();
    }
    process.exit(0);
  }
}

seed();
