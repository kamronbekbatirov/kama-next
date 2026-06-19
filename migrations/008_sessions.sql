-- Tracked login sessions, so the owner can see where they're signed in (web /
-- Telegram) and revoke individual sessions or end them all. The auth cookie
-- stays an HMAC-signed token, but now carries a session id (`sid`) that is
-- validated against this table on every Node-side auth check; revoking a row
-- kills that session.
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL DEFAULT 'web',   -- 'web' | 'telegram'
  method       TEXT,                          -- 'password' | 'telegram'
  user_agent   TEXT,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions (last_seen_at DESC) WHERE revoked = FALSE;

GRANT ALL ON TABLE sessions TO kama_app;
