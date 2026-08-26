-- Prayer times, and schedule blocks that can follow them.
--
-- A block is either on the clock (work, calls — set by other people) or
-- anchored to a prayer (the evening routine — set by the sun). Anchored blocks
-- keep their duration and move with the prayer, which is the only way they can
-- stay right: in Tashkent Maghrib moves just over three hours across the year.
ALTER TABLE schedule_blocks ADD COLUMN IF NOT EXISTS anchor     TEXT;
ALTER TABLE schedule_blocks ADD COLUMN IF NOT EXISTS offset_min INTEGER;

ALTER TABLE schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_anchor_chk;
ALTER TABLE schedule_blocks ADD CONSTRAINT schedule_blocks_anchor_chk
  CHECK (anchor IS NULL OR anchor IN ('fajr','sunrise','dhuhr','asr','maghrib','isha'));
