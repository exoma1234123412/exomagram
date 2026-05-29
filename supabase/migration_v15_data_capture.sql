-- ============================================================
-- V15: Maximum Data Capture
--
-- 1. Entry metadata columns   — source, fill time, completeness, device
-- 2. heartbeat_history        — preserve every status transition
-- 3. unlogged_hours           — track dark hours with context
-- 4. nudge_outcomes           — measure if nudges change behavior
-- 5. stress_evening on closeouts
-- ============================================================

-- ============================================================
-- 1. ENTRY METADATA on time_entries
-- ============================================================
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'manual'
  CHECK (entry_source IN ('manual', 'quick', 'bulk', 'auto_capture', 'template', 'api'));
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS fill_duration_ms int;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS fields_filled smallint DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS completeness_score smallint DEFAULT 0
  CHECK (completeness_score BETWEEN 0 AND 100);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS device_type text
  CHECK (device_type IN ('desktop', 'mobile', 'tablet'));

CREATE INDEX IF NOT EXISTS idx_time_entries_source ON time_entries(org_id, entry_source);
CREATE INDEX IF NOT EXISTS idx_time_entries_completeness ON time_entries(org_id, completeness_score) WHERE completeness_score IS NOT NULL;

-- ============================================================
-- 2. HEARTBEAT HISTORY — log every status transition
-- ============================================================
CREATE TABLE IF NOT EXISTS heartbeat_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  old_status text NOT NULL,
  new_status text NOT NULL,
  duration_seconds int, -- how long they were in old_status
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_history_user ON heartbeat_history(user_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_heartbeat_history_org_date ON heartbeat_history(org_id, changed_at DESC);
-- Partial index for finding idle/offline transitions
CREATE INDEX IF NOT EXISTS idx_heartbeat_idle ON heartbeat_history(user_id, changed_at DESC) WHERE new_status IN ('idle', 'offline');

ALTER TABLE heartbeat_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "heartbeat_history_org_read" ON heartbeat_history FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "heartbeat_history_self_write" ON heartbeat_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 3. UNLOGGED HOURS — dark hour tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS unlogged_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  hour smallint NOT NULL CHECK (hour >= 0 AND hour <= 23),
  -- Context from heartbeat
  was_online boolean DEFAULT false,
  dominant_status text, -- most common status during this hour
  heartbeat_count smallint DEFAULT 0, -- how many heartbeats during this hour
  -- Context from schedule
  within_work_hours boolean DEFAULT true,
  -- Outcome
  filled_later boolean DEFAULT false,
  filled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, org_id, date, hour)
);

CREATE INDEX IF NOT EXISTS idx_unlogged_user_date ON unlogged_hours(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_unlogged_org_date ON unlogged_hours(org_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_unlogged_online ON unlogged_hours(org_id, date) WHERE was_online = true;

ALTER TABLE unlogged_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unlogged_hours_org_read" ON unlogged_hours FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "unlogged_hours_service_write" ON unlogged_hours FOR INSERT
  WITH CHECK (true);
CREATE POLICY "unlogged_hours_service_update" ON unlogged_hours FOR UPDATE
  USING (true);

-- ============================================================
-- 4. NUDGE OUTCOMES — measure notification effectiveness
-- ============================================================
CREATE TABLE IF NOT EXISTS nudge_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  -- What was sent
  nudge_type text NOT NULL, -- private_notification, public_shame, public_praise, flag
  nudge_channel text NOT NULL DEFAULT 'in_app', -- in_app, email, slack, public_feed
  message_preview text, -- first 200 chars
  psychology_technique text, -- which technique was used
  urgency text,
  -- When
  sent_at timestamptz NOT NULL DEFAULT now(),
  -- Response tracking
  notification_id uuid, -- FK to notifications if applicable
  feed_item_id uuid,    -- FK to public_feed if applicable
  -- Outcome
  next_entry_at timestamptz,       -- when user next logged an entry
  response_latency_seconds int,    -- seconds between nudge and next entry
  entries_in_next_hour smallint,   -- how many entries in the hour after nudge
  behavior_changed boolean,        -- did the target behavior change?
  outcome_computed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nudge_user ON nudge_outcomes(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_nudge_org ON nudge_outcomes(org_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_nudge_type ON nudge_outcomes(nudge_type, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_nudge_psychology ON nudge_outcomes(psychology_technique) WHERE psychology_technique IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nudge_pending ON nudge_outcomes(org_id) WHERE outcome_computed_at IS NULL;

ALTER TABLE nudge_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nudge_outcomes_org_read" ON nudge_outcomes FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "nudge_outcomes_service_write" ON nudge_outcomes FOR INSERT
  WITH CHECK (true);
CREATE POLICY "nudge_outcomes_service_update" ON nudge_outcomes FOR UPDATE
  USING (true);

-- ============================================================
-- 5. STRESS EVENING on daily_closeouts
-- ============================================================
ALTER TABLE daily_closeouts ADD COLUMN IF NOT EXISTS stress_evening smallint CHECK (stress_evening BETWEEN 1 AND 5);

-- ============================================================
-- 6. Enable realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE heartbeat_history;
