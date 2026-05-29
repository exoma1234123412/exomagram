-- ============================================================
-- V12: Data Intelligence Layer
--
-- 1. entry_revisions        — Full edit history for every time entry
-- 2. personal_baselines     — Rolling 30-day per-person norms
-- 3. correlation_insights   — Stored cross-dimensional correlations
-- 4. quality_score column   — Permanent AI quality grade on entries
-- 5. entry_version column   — Edit counter
-- 6. meeting_validations    — Wire existing table + auto-matching
-- ============================================================

-- ============================================================
-- 1. ENTRY REVISIONS — track every edit
-- ============================================================
CREATE TABLE IF NOT EXISTS entry_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid REFERENCES time_entries(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  version smallint NOT NULL DEFAULT 1,
  -- What changed
  old_data jsonb NOT NULL,
  new_data jsonb NOT NULL,
  changed_fields text[] NOT NULL DEFAULT '{}',
  -- Context
  change_source text NOT NULL DEFAULT 'user', -- user, ai_enrich, ai_validation, admin
  ai_validation_result jsonb, -- If Claude validated this edit, store result
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entry_revisions_entry ON entry_revisions(entry_id, version);
CREATE INDEX IF NOT EXISTS idx_entry_revisions_user ON entry_revisions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entry_revisions_org ON entry_revisions(org_id, created_at DESC);

ALTER TABLE entry_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entry_revisions_org_read" ON entry_revisions FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "entry_revisions_self_write" ON entry_revisions FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "entry_revisions_service_write" ON entry_revisions FOR INSERT
  WITH CHECK (true); -- Service role for AI enrichment writes

-- ============================================================
-- 2. PERSONAL BASELINES — rolling 30-day norms per person
-- ============================================================
CREATE TABLE IF NOT EXISTS personal_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  computed_date date NOT NULL,
  window_days smallint NOT NULL DEFAULT 30,
  -- Hour norms
  avg_daily_hours numeric(4,1),
  stddev_daily_hours numeric(4,1),
  median_daily_hours numeric(4,1),
  -- Category distribution (percent of total)
  category_distribution jsonb, -- {"deep_work": 0.35, "meeting": 0.20, ...}
  -- Quality norms
  avg_quality_score numeric(4,1),
  avg_proof_rate numeric(5,2), -- 0-100
  avg_late_rate numeric(5,2),  -- 0-100
  -- Subjective norms
  avg_mood numeric(3,1),
  avg_energy numeric(3,1),
  avg_stress numeric(3,1),
  avg_focus_quality numeric(3,1),
  avg_difficulty numeric(3,1),
  avg_confidence numeric(3,1),
  -- Rhythm
  typical_start_hour smallint,
  typical_end_hour smallint,
  peak_productivity_hours smallint[], -- hours with highest deep_work
  meeting_heavy_days smallint[],      -- day-of-week with most meetings (0=Sun)
  -- Engagement
  avg_interruptions_per_hour numeric(3,1),
  avg_context_switches_per_hour numeric(3,1),
  avg_daily_collaborators numeric(3,1),
  standup_rate numeric(5,2),  -- 0-100
  closeout_rate numeric(5,2), -- 0-100
  health_check_rate numeric(5,2), -- 0-100
  promise_reliability numeric(5,2), -- 0-100
  -- Trust trajectory
  avg_trust_score numeric(4,1),
  trust_trend text, -- improving/stable/declining
  -- AI norms
  avg_ai_score numeric(4,1),
  typical_grade text, -- most common grade
  -- Health norms (from daily_health)
  avg_sleep_hours numeric(3,1),
  avg_sleep_quality numeric(3,1),
  avg_exercise_minutes numeric(4,1),
  -- Git norms
  avg_daily_commits numeric(4,1),
  avg_daily_lines numeric(6,1),
  avg_daily_prs numeric(3,1),
  -- Meta
  data_completeness numeric(5,2), -- 0-100, how much data existed in the window
  entries_in_window smallint,
  days_with_data smallint,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, org_id, computed_date)
);

CREATE INDEX IF NOT EXISTS idx_baselines_user ON personal_baselines(user_id, computed_date DESC);
CREATE INDEX IF NOT EXISTS idx_baselines_org ON personal_baselines(org_id, computed_date DESC);

ALTER TABLE personal_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "baselines_org_read" ON personal_baselines FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "baselines_service_write" ON personal_baselines FOR INSERT
  WITH CHECK (true);
CREATE POLICY "baselines_service_update" ON personal_baselines FOR UPDATE
  USING (true);

-- ============================================================
-- 3. CORRELATION INSIGHTS — cross-dimensional patterns
-- ============================================================
CREATE TABLE IF NOT EXISTS correlation_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- null = team-wide
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  computed_date date NOT NULL,
  window_days smallint NOT NULL DEFAULT 30,
  -- Correlation pair
  dimension_a text NOT NULL, -- e.g. "sleep_hours", "mood", "meetings"
  dimension_b text NOT NULL, -- e.g. "productivity", "quality_score", "deep_work_hours"
  -- Results
  correlation_coefficient numeric(5,3), -- -1.0 to 1.0
  p_value numeric(6,4),
  sample_size smallint,
  strength text, -- strong_positive, moderate_positive, weak, moderate_negative, strong_negative
  -- Interpretation
  insight text, -- AI-generated human-readable insight
  actionable boolean DEFAULT false,
  recommendation text, -- what to do about it
  -- Confidence
  confidence numeric(5,2), -- 0-100
  data_quality text, -- high, medium, low (based on completeness)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_correlations_user ON correlation_insights(user_id, computed_date DESC);
CREATE INDEX IF NOT EXISTS idx_correlations_org ON correlation_insights(org_id, computed_date DESC);
CREATE INDEX IF NOT EXISTS idx_correlations_dimensions ON correlation_insights(dimension_a, dimension_b);
CREATE INDEX IF NOT EXISTS idx_correlations_strength ON correlation_insights(org_id, strength) WHERE strength IN ('strong_positive', 'strong_negative');

ALTER TABLE correlation_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "correlations_org_read" ON correlation_insights FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "correlations_service_write" ON correlation_insights FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- 4. QUALITY SCORE + VERSION on time_entries
-- ============================================================
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS quality_score smallint CHECK (quality_score BETWEEN 0 AND 100);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS entry_version smallint NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_time_entries_quality ON time_entries(org_id, quality_score) WHERE quality_score IS NOT NULL;

-- ============================================================
-- 5. Wire meeting_verifications — auto-match trigger
-- ============================================================
-- Add indexes if table exists (was created in earlier migration)
CREATE INDEX IF NOT EXISTS idx_meeting_verifications_entry ON meeting_verifications(entry_id);
CREATE INDEX IF NOT EXISTS idx_meeting_verifications_verifier ON meeting_verifications(verifier_id, status);
CREATE INDEX IF NOT EXISTS idx_meeting_verifications_org ON meeting_verifications(org_id, created_at DESC);

-- ============================================================
-- 6. Enable realtime on revision tracking
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE entry_revisions;
