-- Migration v8: Add work schedule columns to profiles
-- Required by /setup page and middleware setup_completed check

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS work_start_hour int DEFAULT 7;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS work_end_hour int DEFAULT 18;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS setup_completed boolean DEFAULT false;
