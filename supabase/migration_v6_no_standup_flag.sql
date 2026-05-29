-- Migration v6: Add 'no_standup' flag type to accountability_flags
-- This fixes Bug 6 where standup flags were incorrectly saved as 'no_closeout'

-- Drop and recreate the CHECK constraint to include 'no_standup'
ALTER TABLE accountability_flags DROP CONSTRAINT IF EXISTS accountability_flags_flag_type_check;

ALTER TABLE accountability_flags ADD CONSTRAINT accountability_flags_flag_type_check
  CHECK (flag_type IN (
    'missing_hours',
    'no_proof',
    'late_entries',
    'no_closeout',
    'no_standup',
    'low_detail',
    'suspicious_pattern',
    'idle_long'
  ));
