-- Move all dashboard state from localStorage into Postgres.
-- Adds: settings, schedule_blocks, habit_defs, habit_custom_completions,
-- subscriptions, telegram_messages.

-- Generic key/value store (used for initial_balance and similar scalars)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Schedule blocks (replaces kama_schedule)
CREATE TABLE IF NOT EXISTS schedule_blocks (
  id TEXT PRIMARY KEY,
  start_min INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1440),
  end_min INTEGER NOT NULL CHECK (end_min BETWEEN 0 AND 1440),
  label TEXT NOT NULL,
  icon TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habit definitions (replaces kama_habits)
CREATE TABLE IF NOT EXISTS habit_defs (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  builtin BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-day custom habit completions (replaces kama_chd_[date])
CREATE TABLE IF NOT EXISTS habit_custom_completions (
  date DATE NOT NULL,
  habit_id TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (date, habit_id)
);
CREATE INDEX IF NOT EXISTS idx_habit_custom_date ON habit_custom_completions(date);

-- Subscriptions (replaces kama_subscriptions)
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT '$',
  day INTEGER NOT NULL DEFAULT 1 CHECK (day BETWEEN 1 AND 31),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Telegram chat history with the Claude assistant
CREATE TABLE IF NOT EXISTS telegram_messages (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  chat_id BIGINT,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  message_id BIGINT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cache_read_tokens INTEGER,
  cache_create_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tg_msgs_user_time ON telegram_messages(telegram_id, created_at DESC);
