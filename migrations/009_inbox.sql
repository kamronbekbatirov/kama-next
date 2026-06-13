-- 009_inbox.sql — dashboard inbox: contact/feedback form submissions and
-- received email, plus dashboard-sent replies. Forward-only, idempotent.

-- Incoming messages: site contact/feedback forms (kind contact|feedback) and
-- email received at the domains (kind email).
CREATE TABLE IF NOT EXISTS inbox_messages (
  id          bigserial PRIMARY KEY,
  source      text        NOT NULL,                       -- 'kama.uz', 'humanbase', recipient domain, ...
  kind        text        NOT NULL DEFAULT 'contact',      -- 'contact' | 'feedback' | 'email'
  category    text,                                        -- feedback: bug/idea/love/other
  name        text,
  email       text,
  subject     text,
  message     text        NOT NULL,                        -- plain-text body
  html        text,                                        -- original HTML body (email), rendered in a sandboxed iframe
  meta        jsonb       NOT NULL DEFAULT '{}'::jsonb,     -- emailId, to, message_id, profile #, ...
  ip          text,
  user_agent  text,
  status      text        NOT NULL DEFAULT 'new',          -- 'new' | 'read' | 'archived'
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz,
  CONSTRAINT inbox_status_check CHECK (status IN ('new','read','archived')),
  CONSTRAINT inbox_kind_check   CHECK (kind   IN ('contact','feedback','email'))
);
CREATE INDEX IF NOT EXISTS idx_inbox_status_created ON inbox_messages (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_created        ON inbox_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_email_id       ON inbox_messages ((meta->>'emailId')) WHERE meta ? 'emailId';

-- Tombstone of every received email id ever ingested, so a deleted message is
-- NOT re-pulled by the Resend receiving sync.
CREATE TABLE IF NOT EXISTS inbox_seen_emails (
  email_id   text PRIMARY KEY,
  first_seen timestamptz NOT NULL DEFAULT now()
);

-- Replies / new mail sent from the dashboard (via Resend), with a copy kept for
-- the Sent view and per-message threads.
CREATE TABLE IF NOT EXISTS sent_messages (
  id           bigserial PRIMARY KEY,
  in_reply_to  bigint REFERENCES inbox_messages(id) ON DELETE SET NULL,
  from_addr    text        NOT NULL,
  to_email     text        NOT NULL,
  to_name      text,
  subject      text        NOT NULL,
  body         text        NOT NULL,
  resend_id    text,
  status       text        NOT NULL DEFAULT 'sent',        -- 'sent' | 'failed'
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sent_status_check CHECK (status IN ('sent','failed'))
);
CREATE INDEX IF NOT EXISTS idx_sent_in_reply_to ON sent_messages (in_reply_to);
CREATE INDEX IF NOT EXISTS idx_sent_created     ON sent_messages (created_at DESC);
