-- Members (the first real notion of a *person* in this app) and the shared
-- goal tracker.
--
-- Until now everything was single-tenant: no table carried an owner column and
-- `getSession()` answered only "is somebody logged in". `members` is what lets
-- invited guests reach the tracker below and nothing else.
--
-- `members` is also the revocation point. The session cookie carries a role
-- hint so Edge middleware can route without a database round trip, but a cookie
-- lives 7 days and cannot be recalled — so every Node-side auth check joins
-- against this table and flipping `revoked_at` kills access on the next
-- request, including the bot.

CREATE TABLE IF NOT EXISTS members (
  id            TEXT PRIMARY KEY,              -- randomUUID() in Node, like sessions.id
  telegram_id   TEXT UNIQUE,                   -- null until they open the Mini App
  role          TEXT NOT NULL DEFAULT 'guest',
  display_name  TEXT NOT NULL,
  username      TEXT,
  tz            TEXT,
  lang          TEXT,
  invited_by    TEXT REFERENCES members(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  CONSTRAINT members_role_check CHECK (role IN ('owner','guest')),
  CONSTRAINT members_lang_check CHECK (lang IS NULL OR lang IN ('en','ru','uz'))
);

-- There is exactly one owner, enforced by the database rather than by care.
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_owner_singleton ON members ((role)) WHERE role = 'owner';
CREATE INDEX IF NOT EXISTS idx_members_active ON members (role) WHERE revoked_at IS NULL;

-- Sessions gain an owner. The JOIN in getSession() is what makes revocation
-- instant: kill the member and every session they hold stops resolving.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS member_id TEXT REFERENCES members(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_sessions_member ON sessions (member_id) WHERE revoked = FALSE;

-- Seed the owner and adopt existing sessions, so the owner is not logged out by
-- this migration. The owner's telegram_id is backfilled at runtime from
-- OWNER_TELEGRAM_ID (env is not available to psql).
INSERT INTO members (id, role, display_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'owner', 'Kamronbek')
ON CONFLICT (id) DO NOTHING;

UPDATE sessions SET member_id = '00000000-0000-0000-0000-000000000001' WHERE member_id IS NULL;

-- Single-use invite links. Guests never get a password: the token is 256 bits
-- of CSPRNG, stored only as a hash, and redeemed exactly once — the
-- `AND used_at IS NULL` in the redeeming UPDATE is what makes that atomic
-- without a transaction (this codebase has no transaction helper).
CREATE TABLE IF NOT EXISTS member_invites (
  id          TEXT PRIMARY KEY,
  member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_by  TEXT REFERENCES members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  used_ip     TEXT
);

CREATE INDEX IF NOT EXISTS idx_member_invites_open ON member_invites (member_id) WHERE used_at IS NULL;

-- ─── Tracker ────────────────────────────────────────────────────────────────
-- A goal cannot exist without the two things the research says make goals work:
-- a measurable target (Locke & Latham) and an if-then plan (Gollwitzer &
-- Sheeran). Both are NOT NULL on purpose — the form must not be the only thing
-- enforcing them.
--
-- Note what is deliberately absent: no `deadline`, and no `streak` column. A
-- habit has no due date (Lally's ~66 days is a median of a subsample, not a
-- law), and streaks are computed on read so a missed day can be rendered as a
-- gap rather than a failure.
CREATE TABLE IF NOT EXISTS tracker_goals (
  id            BIGSERIAL PRIMARY KEY,
  member_id     TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  metric_unit   TEXT NOT NULL,                 -- "km", "minutes", "times"
  target_value  NUMERIC(12,2) NOT NULL,
  period        TEXT NOT NULL DEFAULT 'day',
  cue_when      TEXT NOT NULL,                 -- "if / when ..."
  action_then   TEXT NOT NULL,                 -- "then I will ..."
  start_date    DATE NOT NULL,
  ends_on       DATE,                          -- optional review date, never labelled "due"
  status        TEXT NOT NULL DEFAULT 'active',
  -- Clean room for later phases: {woop:{...}} and {stake:{...}} land here
  -- without another migration.
  extras        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tracker_goals_target_check CHECK (target_value > 0),
  CONSTRAINT tracker_goals_period_check CHECK (period IN ('day','week')),
  CONSTRAINT tracker_goals_status_check CHECK (status IN ('active','paused','archived')),
  CONSTRAINT tracker_goals_title_check  CHECK (length(btrim(title)) > 0),
  CONSTRAINT tracker_goals_cue_check    CHECK (length(btrim(cue_when)) > 0),
  CONSTRAINT tracker_goals_action_check CHECK (length(btrim(action_then)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_tracker_goals_member ON tracker_goals (member_id) WHERE status = 'active';

-- Progress as a time series, not an overwritten percentage: monitoring only
-- produces the effect when it is recorded over time (Harkin 2016).
--
-- `member_id` is denormalised here even though `goal_id` implies it. That is
-- deliberate: every guest-facing query then filters on `member_id` directly,
-- which is the invariant a security review can grep for, and the group board
-- aggregates without a join.
CREATE TABLE IF NOT EXISTS tracker_checkins (
  id          BIGSERIAL PRIMARY KEY,
  goal_id     BIGINT NOT NULL REFERENCES tracker_goals(id) ON DELETE CASCADE,
  member_id   TEXT   NOT NULL REFERENCES members(id)       ON DELETE CASCADE,
  day         DATE   NOT NULL,                 -- the member's calendar day, sent by the client
  value       NUMERIC(12,2) NOT NULL DEFAULT 1,
  note        TEXT,
  source      TEXT NOT NULL DEFAULT 'app',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tracker_checkins_value_check  CHECK (value >= 0),
  CONSTRAINT tracker_checkins_source_check CHECK (source IN ('app','bot')),
  CONSTRAINT tracker_checkins_unique UNIQUE (goal_id, day)
);

CREATE INDEX IF NOT EXISTS idx_tracker_checkins_goal_day   ON tracker_checkins (goal_id, day DESC);
CREATE INDEX IF NOT EXISTS idx_tracker_checkins_member_day ON tracker_checkins (member_id, day DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kama_app') THEN
    GRANT ALL ON TABLE members, member_invites, tracker_goals, tracker_checkins TO kama_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kama_app;
  END IF;
END $$;
