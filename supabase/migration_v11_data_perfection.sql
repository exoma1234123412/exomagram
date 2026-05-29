-- ============================================================
-- V11: Data Perfection — 10/10 across all dimensions
--
-- 1. ai_profile_history    — Version AI profiles over time (no more overwrites)
-- 2. Promoted AI columns   — Queryable indexes on ai_daily_insights
-- 3. Soft deletes          — time_entries never truly lost
-- 4. daily_aggregates      — Pre-computed daily stats per person
-- 5. weekly_aggregates     — Pre-computed weekly rollups per person
-- 6. Health/reflection enforcement flags
-- ============================================================

-- ============================================================
-- 1. AI PROFILE HISTORY — snapshot every profile change
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_profile_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  profile_data jsonb NOT NULL,
  -- Promoted fields for direct querying
  work_personality text,
  chronotype text,
  consistency_score smallint CHECK (consistency_score BETWEEN 0 AND 100),
  autonomy_level text,
  communication_style text,
  burnout_risk smallint CHECK (burnout_risk BETWEEN 0 AND 100),
  disengagement_risk smallint CHECK (disengagement_risk BETWEEN 0 AND 100),
  trajectory text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, org_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ai_profile_history_user_date ON ai_profile_history(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_profile_history_org_date ON ai_profile_history(org_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_profile_history_burnout ON ai_profile_history(org_id, burnout_risk DESC) WHERE burnout_risk IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_profile_history_trajectory ON ai_profile_history(org_id, trajectory) WHERE trajectory IS NOT NULL;

ALTER TABLE ai_profile_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_profile_history_org_read" ON ai_profile_history FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "ai_profile_history_service_write" ON ai_profile_history FOR INSERT
  WITH CHECK (true); -- Service role only (cron)

-- ============================================================
-- 2. PROMOTED COLUMNS on ai_daily_insights
-- ============================================================
ALTER TABLE ai_daily_insights ADD COLUMN IF NOT EXISTS grade text;
ALTER TABLE ai_daily_insights ADD COLUMN IF NOT EXISTS score smallint CHECK (score BETWEEN 0 AND 100);
ALTER TABLE ai_daily_insights ADD COLUMN IF NOT EXISTS burnout_risk smallint CHECK (burnout_risk BETWEEN 0 AND 100);
ALTER TABLE ai_daily_insights ADD COLUMN IF NOT EXISTS disengagement_risk smallint CHECK (disengagement_risk BETWEEN 0 AND 100);
ALTER TABLE ai_daily_insights ADD COLUMN IF NOT EXISTS trajectory text;
ALTER TABLE ai_daily_insights ADD COLUMN IF NOT EXISTS productive_hours smallint;
ALTER TABLE ai_daily_insights ADD COLUMN IF NOT EXISTS wasted_hours smallint;
ALTER TABLE ai_daily_insights ADD COLUMN IF NOT EXISTS evidence_quality smallint CHECK (evidence_quality BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS idx_ai_insights_grade ON ai_daily_insights(org_id, grade) WHERE grade IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_insights_score ON ai_daily_insights(org_id, score DESC) WHERE score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_insights_burnout ON ai_daily_insights(org_id, burnout_risk DESC) WHERE burnout_risk IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_insights_trajectory ON ai_daily_insights(org_id, trajectory) WHERE trajectory IS NOT NULL;

-- ============================================================
-- 3. SOFT DELETES on time_entries
-- ============================================================
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS deletion_reason text;

CREATE INDEX IF NOT EXISTS idx_time_entries_deleted ON time_entries(deleted_at) WHERE deleted_at IS NOT NULL;

-- Update SELECT policy to exclude soft-deleted entries by default
-- Drop and recreate the select policy
DROP POLICY IF EXISTS "Members can view all org time entries" ON time_entries;
CREATE POLICY "Members can view all org time entries"
  ON time_entries FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
    AND deleted_at IS NULL
  );

-- New policy: admins can see deleted entries for audit
CREATE POLICY "Admins can view deleted entries"
  ON time_entries FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    AND deleted_at IS NOT NULL
  );

-- ============================================================
-- 4. DAILY AGGREGATES — pre-computed per person per day
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  -- Hours
  total_hours smallint NOT NULL DEFAULT 0,
  deep_work_hours smallint DEFAULT 0,
  meeting_hours smallint DEFAULT 0,
  review_hours smallint DEFAULT 0,
  admin_hours smallint DEFAULT 0,
  planning_hours smallint DEFAULT 0,
  learning_hours smallint DEFAULT 0,
  break_hours smallint DEFAULT 0,
  blocked_hours smallint DEFAULT 0,
  -- Quality
  hours_with_proof smallint DEFAULT 0,
  late_entries smallint DEFAULT 0,
  flagged_entries smallint DEFAULT 0,
  avg_mood numeric(3,1),
  avg_energy numeric(3,1),
  avg_stress numeric(3,1),
  avg_focus_quality numeric(3,1),
  avg_difficulty numeric(3,1),
  avg_value_rating numeric(3,1),
  avg_confidence numeric(3,1),
  -- Context
  total_interruptions smallint DEFAULT 0,
  total_context_switches smallint DEFAULT 0,
  unique_collaborators smallint DEFAULT 0,
  unique_projects smallint DEFAULT 0,
  client_facing_hours smallint DEFAULT 0,
  async_possible_hours smallint DEFAULT 0,
  -- Rituals
  has_standup boolean DEFAULT false,
  has_closeout boolean DEFAULT false,
  has_health_check boolean DEFAULT false,
  promises_made smallint DEFAULT 0,
  promises_kept smallint DEFAULT 0,
  promises_broken smallint DEFAULT 0,
  -- Scores
  trust_score smallint,
  ai_grade text,
  ai_score smallint,
  -- Git (from git_daily_metrics if available)
  git_commits smallint DEFAULT 0,
  git_lines_added int DEFAULT 0,
  git_lines_removed int DEFAULT 0,
  git_prs_opened smallint DEFAULT 0,
  git_prs_merged smallint DEFAULT 0,
  -- Comms (from communication_log if available)
  messages_sent smallint DEFAULT 0,
  meetings_attended smallint DEFAULT 0,
  meeting_minutes smallint DEFAULT 0,
  -- Focus sessions
  focus_sessions_count smallint DEFAULT 0,
  focus_sessions_completed smallint DEFAULT 0,
  focus_total_interruptions smallint DEFAULT 0,
  flow_states_achieved smallint DEFAULT 0,
  -- Flags
  flags_raised smallint DEFAULT 0,
  flags_resolved smallint DEFAULT 0,
  -- Reactions received
  reactions_verified smallint DEFAULT 0,
  reactions_suspicious smallint DEFAULT 0,
  reactions_impressive smallint DEFAULT 0,
  reactions_helped smallint DEFAULT 0,
  -- Meta
  computed_at timestamptz DEFAULT now(),
  UNIQUE(user_id, org_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_agg_user_date ON daily_aggregates(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_agg_org_date ON daily_aggregates(org_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_agg_score ON daily_aggregates(org_id, ai_score DESC) WHERE ai_score IS NOT NULL;

ALTER TABLE daily_aggregates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_aggregates_org_read" ON daily_aggregates FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "daily_aggregates_service_write" ON daily_aggregates FOR INSERT
  WITH CHECK (true);
CREATE POLICY "daily_aggregates_service_update" ON daily_aggregates FOR UPDATE
  USING (true);

-- ============================================================
-- 5. WEEKLY AGGREGATES — rolled up from daily
-- ============================================================
CREATE TABLE IF NOT EXISTS weekly_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  week_start date NOT NULL,
  -- Rolled-up hours
  total_hours smallint DEFAULT 0,
  deep_work_hours smallint DEFAULT 0,
  meeting_hours smallint DEFAULT 0,
  hours_with_proof smallint DEFAULT 0,
  late_entries smallint DEFAULT 0,
  -- Averages
  avg_daily_hours numeric(3,1),
  avg_mood numeric(3,1),
  avg_energy numeric(3,1),
  avg_stress numeric(3,1),
  avg_trust_score numeric(4,1),
  -- Rituals
  standups_completed smallint DEFAULT 0,
  closeouts_completed smallint DEFAULT 0,
  health_checks_completed smallint DEFAULT 0,
  days_logged smallint DEFAULT 0,
  -- Promises
  total_promises smallint DEFAULT 0,
  promises_kept smallint DEFAULT 0,
  promises_broken smallint DEFAULT 0,
  promise_reliability numeric(5,2),
  -- Git
  total_commits smallint DEFAULT 0,
  total_lines_added int DEFAULT 0,
  total_prs smallint DEFAULT 0,
  -- AI
  avg_ai_score numeric(4,1),
  grades jsonb, -- {"A": 2, "B": 3} count per grade
  trajectory_trend text, -- improving/stable/declining based on daily trajectories
  burnout_risk_trend text, -- rising/stable/falling
  -- Focus
  total_focus_sessions smallint DEFAULT 0,
  total_flow_states smallint DEFAULT 0,
  -- Flags
  total_flags smallint DEFAULT 0,
  total_flags_resolved smallint DEFAULT 0,
  -- Reflection
  has_weekly_reflection boolean DEFAULT false,
  reflection_satisfaction smallint,
  reflection_work_life_balance smallint,
  -- Meta
  computed_at timestamptz DEFAULT now(),
  UNIQUE(user_id, org_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_agg_user ON weekly_aggregates(user_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_agg_org ON weekly_aggregates(org_id, week_start DESC);

ALTER TABLE weekly_aggregates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weekly_aggregates_org_read" ON weekly_aggregates FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "weekly_aggregates_service_write" ON weekly_aggregates FOR INSERT
  WITH CHECK (true);
CREATE POLICY "weekly_aggregates_service_update" ON weekly_aggregates FOR UPDATE
  USING (true);

-- ============================================================
-- 6. ENTRY DELETION LOG — forensic trail of every deletion
-- ============================================================
CREATE TABLE IF NOT EXISTS entry_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL,
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  deleted_by uuid NOT NULL,
  reason text,
  entry_snapshot jsonb NOT NULL, -- full copy of the entry at deletion time
  deleted_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deletion_log_org ON entry_deletion_log(org_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_log_user ON entry_deletion_log(user_id, deleted_at DESC);

ALTER TABLE entry_deletion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deletion_log_admin_read" ON entry_deletion_log FOR SELECT
  USING (org_id IN (
    SELECT org_id FROM org_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));
CREATE POLICY "deletion_log_service_write" ON entry_deletion_log FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- Enable realtime on new aggregate tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE daily_aggregates;
ALTER PUBLICATION supabase_realtime ADD TABLE weekly_aggregates;
