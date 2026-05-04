-- Learning Hub schema
-- Run: psql "$DATABASE_URL" -f migrations/001_learn.sql

CREATE TABLE IF NOT EXISTS learn_subjects (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  emoji TEXT,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learn_nodes (
  id SERIAL PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES learn_subjects(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES learn_nodes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','learning','reviewing','mastered')),
  mastery_percent INTEGER NOT NULL DEFAULT 0 CHECK (mastery_percent BETWEEN 0 AND 100),
  position INTEGER NOT NULL DEFAULT 0,
  next_review TIMESTAMPTZ,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  resources JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learn_nodes_subject ON learn_nodes(subject_id);
CREATE INDEX IF NOT EXISTS idx_learn_nodes_parent ON learn_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_learn_nodes_review ON learn_nodes(next_review) WHERE next_review IS NOT NULL;

CREATE TABLE IF NOT EXISTS learn_sessions (
  id SERIAL PRIMARY KEY,
  node_id INTEGER NOT NULL REFERENCES learn_nodes(id) ON DELETE CASCADE,
  recall_score SMALLINT NOT NULL CHECK (recall_score BETWEEN 1 AND 5),
  notes TEXT,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learn_sessions_node ON learn_sessions(node_id, created_at DESC);

CREATE TABLE IF NOT EXISTS learn_methods (
  id SERIAL PRIMARY KEY,
  method TEXT NOT NULL
    CHECK (method IN ('woop','two_minute','if_then','goal','commitment','intrinsic')),
  title TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  subject_id INTEGER REFERENCES learn_subjects(id) ON DELETE SET NULL,
  node_id INTEGER REFERENCES learn_nodes(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learn_methods_method ON learn_methods(method) WHERE active = TRUE;
