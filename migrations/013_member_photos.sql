-- Telegram profile photos for the shared board.
--
-- We store the file_id rather than the CDN url from initData: initData only
-- ever carries the *viewer's* photo, and its telesco.pe url is not promised to
-- keep resolving. A file_id belongs to the bot and can be turned into fresh
-- bytes whenever they are asked for.
ALTER TABLE members ADD COLUMN IF NOT EXISTS photo_file_id    TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS photo_checked_at TIMESTAMPTZ;
