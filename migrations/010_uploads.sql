-- 010_uploads.sql — public drop-box at /upload. Submissions land in the same
-- dashboard inbox as the contact forms (kind 'upload'), with the actual bytes
-- kept on disk outside the web root and referenced by `inbox_attachments`.
-- Forward-only, idempotent.

-- 'upload' joins the existing kinds. The constraint is recreated because
-- CHECK constraints can't be extended in place.
ALTER TABLE inbox_messages DROP CONSTRAINT IF EXISTS inbox_kind_check;
ALTER TABLE inbox_messages ADD  CONSTRAINT inbox_kind_check
  CHECK (kind IN ('contact','feedback','email','upload'));

-- One row per stored file.
--
-- `storage_key` is a server-generated opaque path (YYYY/MM/<32 hex>) with NO
-- extension — the original name never touches the filesystem, so a crafted
-- filename can't traverse directories or land an executable extension on disk.
-- `filename` is the sanitized display name, shown in the dashboard only.
-- `mime` is what the server SNIFFED from the file's magic bytes, never what the
-- client claimed; it is the only content type we ever serve the file back with.
CREATE TABLE IF NOT EXISTS inbox_attachments (
  id          bigserial PRIMARY KEY,
  message_id  bigint      NOT NULL REFERENCES inbox_messages(id) ON DELETE CASCADE,
  filename    text        NOT NULL,
  storage_key text        NOT NULL UNIQUE,
  mime        text        NOT NULL,
  size_bytes  bigint      NOT NULL,
  sha256      text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbox_attachments_size_check CHECK (size_bytes >= 0)
);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON inbox_attachments (message_id);
CREATE INDEX IF NOT EXISTS idx_attachments_sha256  ON inbox_attachments (sha256);

-- Rolling per-IP ledger of accepted uploads, used for the abuse quota. Rows
-- older than the quota window are swept on each new upload session.
CREATE TABLE IF NOT EXISTS upload_quota (
  id          bigserial PRIMARY KEY,
  ip          text        NOT NULL,
  bytes       bigint      NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_upload_quota_ip_created ON upload_quota (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_quota_created    ON upload_quota (created_at);

-- This file is applied as `postgres`, so the tables above are owned by postgres
-- while the app connects as kama_app. Grant explicitly (same shape as the
-- `sessions` table) — there are no default ACLs in this database.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kama_app') THEN
    GRANT ALL PRIVILEGES ON TABLE inbox_attachments TO kama_app;
    GRANT ALL PRIVILEGES ON TABLE upload_quota      TO kama_app;
    GRANT USAGE, SELECT ON SEQUENCE inbox_attachments_id_seq TO kama_app;
    GRANT USAGE, SELECT ON SEQUENCE upload_quota_id_seq      TO kama_app;
  END IF;
END $$;
