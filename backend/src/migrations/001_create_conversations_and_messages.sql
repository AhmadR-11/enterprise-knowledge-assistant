-- backend/src/migrations/001_create_conversations_and_messages.sql
-- Idempotent schema migration for persistent chat conversations and messages.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast user conversation list sorted by recent activity
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated 
  ON conversations(user_id, updated_at DESC);

-- 2. Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('complete', 'stopped', 'error')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_activity JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for chronological message retrieval per conversation
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
  ON messages(conversation_id, created_at ASC);

