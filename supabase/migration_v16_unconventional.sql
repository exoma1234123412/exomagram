-- ============================================================
-- V16: Unconventional Intelligence
--
-- 1. Entry forensic columns    — backfill prob, entropy, typing, vocabulary, continuity
-- 2. proof_verification_log    — periodic proof URL health checks
-- 3. mood_contagion_events     — mood spread between collaborators
-- 4. meeting_accountability    — who fails to log meetings others documented
-- 5. work_dna_vectors          — encoded work pattern fingerprints
-- 6. engagement_decay_models   — per-person engagement half-life
-- 7. claude_calibration_log    — prediction accuracy tracking
-- 8. first_entry_predictions   — predicted vs actual first entry time
-- 9. vocabulary_profiles       — per-person word usage model
-- ============================================================

-- ============================================================
-- 1. ENTRY FORENSIC COLUMNS on time_entries
-- ============================================================
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS backfill_probability smallint CHECK (backfill_probability BETWEEN 0 AND 100);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS description_entropy numeric(5,3);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS semantic_continuity_score smallint CHECK (semantic_continuity_score BETWEEN 0 AND 100);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS typing_speed_wpm smallint;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS typing_deletion_count smallint DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS typing_pause_count smallint DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS typing_authenticity_score smallint CHECK (typing_authenticity_score BETWEEN 0 AND 100);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS vocabulary_uniqueness_score smallint CHECK (vocabulary_uniqueness_score BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS idx_entries_backfill ON time_entries(org_id, backfill_probability DESC) WHERE backfill_probability IS NOT NULL AND backfill_probability > 50;
CREATE INDEX IF NOT EXISTS idx_entries_entropy ON time_entries(org_id, description_entropy) WHERE description_entropy IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entries_authenticity ON time_entries(org_id, typing_authenticity_score) WHERE typing_authenticity_score IS NOT NULL;

-- ============================================================
-- 2. PROOF VERIFICATION LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS proof_verification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid REFERENCES time_entries(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  url text NOT NULL,
  -- Verification result
  status_code smallint,
  is_accessible boolean NOT NULL,
  was_accessible_before boolean, -- true if it worked last check
  content_type text,
  -- Decay detection
  first_verified_at timestamptz,
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  verification_count smallint DEFAULT 1,
  decay_detected boolean DEFAULT false, -- true if URL stopped working
  decay_detected_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proof_verify_entry ON proof_verification_log(entry_id);
CREATE INDEX IF NOT EXISTS idx_proof_verify_decay ON proof_verification_log(org_id) WHERE decay_detected = true;

ALTER TABLE proof_verification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proof_verify_org_read" ON proof_verification_log FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "proof_verify_service_write" ON proof_verification_log FOR INSERT WITH CHECK (true);
CREATE POLICY "proof_verify_service_update" ON proof_verification_log FOR UPDATE USING (true);

-- ============================================================
-- 3. MOOD CONTAGION EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS mood_contagion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  -- Source person (mood changed first)
  source_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source_mood_before smallint,
  source_mood_after smallint,
  source_hour smallint NOT NULL,
  -- Affected person (mood changed after)
  affected_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  affected_mood_before smallint,
  affected_mood_after smallint,
  affected_hour smallint NOT NULL,
  -- Analysis
  shared_collaborator boolean DEFAULT false, -- were they collaborating?
  delay_hours smallint, -- hours between source and affected mood change
  contagion_direction text CHECK (contagion_direction IN ('negative', 'positive')),
  confidence smallint CHECK (confidence BETWEEN 0 AND 100),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contagion_source ON mood_contagion_events(source_user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_contagion_org ON mood_contagion_events(org_id, date DESC);

ALTER TABLE mood_contagion_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contagion_org_read" ON mood_contagion_events FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "contagion_service_write" ON mood_contagion_events FOR INSERT WITH CHECK (true);

-- ============================================================
-- 4. MEETING ACCOUNTABILITY
-- ============================================================
CREATE TABLE IF NOT EXISTS meeting_accountability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  hour smallint NOT NULL,
  -- Who logged the meeting
  logger_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  logger_entry_id uuid REFERENCES time_entries(id) ON DELETE CASCADE,
  -- Who was named but didn't log
  missing_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- What the missing person logged instead (if anything)
  missing_user_category text, -- what they logged at that hour, or null
  missing_user_title text,
  -- Status
  resolved boolean DEFAULT false, -- did the missing person eventually log it?
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, date, hour, logger_user_id, missing_user_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_acc_missing ON meeting_accountability(missing_user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_acc_org ON meeting_accountability(org_id, date DESC);

ALTER TABLE meeting_accountability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meeting_acc_org_read" ON meeting_accountability FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "meeting_acc_service_write" ON meeting_accountability FOR INSERT WITH CHECK (true);
CREATE POLICY "meeting_acc_service_update" ON meeting_accountability FOR UPDATE USING (true);

-- ============================================================
-- 5. WORK DNA VECTORS
-- ============================================================
CREATE TABLE IF NOT EXISTS work_dna_vectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  computed_date date NOT NULL,
  window_days smallint NOT NULL DEFAULT 30,
  -- The vector (fixed-length feature array)
  category_vector numeric(4,3)[], -- [deep_work%, meeting%, review%, admin%, planning%, learning%, break%, blocked%]
  hourly_vector numeric(4,3)[],   -- [h7%, h8%, ..., h18%] — when they work
  quality_vector numeric(4,3)[],  -- [avg_quality, avg_mood, avg_energy, avg_stress, avg_focus]
  behavior_vector numeric(4,3)[], -- [proof_rate, late_rate, standup_rate, closeout_rate, promise_rate]
  social_vector numeric(4,3)[],   -- [avg_collaborators, shoutouts_given_rate, shoutouts_rx_rate, reactions_given_rate]
  -- Derived
  vector_magnitude numeric(6,3), -- L2 norm of all vectors combined
  similarity_to_team_avg numeric(5,3), -- cosine similarity to team centroid
  week_over_week_shift numeric(5,3), -- euclidean distance from last week's vector
  -- Classification
  archetype text, -- auto-classified: "builder", "coordinator", "specialist", "generalist", "firefighter"
  anomaly_score numeric(5,3), -- how much this week deviates from their own history
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, org_id, computed_date)
);

CREATE INDEX IF NOT EXISTS idx_dna_user ON work_dna_vectors(user_id, computed_date DESC);
CREATE INDEX IF NOT EXISTS idx_dna_org ON work_dna_vectors(org_id, computed_date DESC);
CREATE INDEX IF NOT EXISTS idx_dna_anomaly ON work_dna_vectors(org_id, anomaly_score DESC) WHERE anomaly_score IS NOT NULL;

ALTER TABLE work_dna_vectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dna_org_read" ON work_dna_vectors FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "dna_service_write" ON work_dna_vectors FOR INSERT WITH CHECK (true);
CREATE POLICY "dna_service_update" ON work_dna_vectors FOR UPDATE USING (true);

-- ============================================================
-- 6. ENGAGEMENT DECAY MODELS
-- ============================================================
CREATE TABLE IF NOT EXISTS engagement_decay_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  computed_date date NOT NULL,
  -- Model parameters
  initial_engagement numeric(5,2), -- starting engagement level (0-100)
  current_engagement numeric(5,2), -- current level
  decay_rate numeric(6,4),         -- rate of decay per day (0 = no decay, 1 = instant)
  half_life_days numeric(6,1),     -- days until engagement halves
  -- Predictions
  predicted_critical_date date,    -- when engagement crosses 30% threshold
  days_until_critical smallint,
  -- Data quality
  r_squared numeric(5,3),         -- how well the model fits (0-1)
  data_points smallint,
  -- Trend
  trend text CHECK (trend IN ('accelerating_decay', 'stable_decay', 'recovering', 'stable_high', 'new_user')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, org_id, computed_date)
);

CREATE INDEX IF NOT EXISTS idx_decay_user ON engagement_decay_models(user_id, computed_date DESC);
CREATE INDEX IF NOT EXISTS idx_decay_critical ON engagement_decay_models(org_id, days_until_critical) WHERE days_until_critical IS NOT NULL AND days_until_critical < 30;

ALTER TABLE engagement_decay_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "decay_org_read" ON engagement_decay_models FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "decay_service_write" ON engagement_decay_models FOR INSERT WITH CHECK (true);
CREATE POLICY "decay_service_update" ON engagement_decay_models FOR UPDATE USING (true);

-- ============================================================
-- 7. CLAUDE CALIBRATION LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS claude_calibration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- What was predicted
  prediction_type text NOT NULL, -- burnout_risk, trajectory, grade, engagement
  prediction_date date NOT NULL,
  predicted_value text NOT NULL,
  confidence smallint, -- 0-100
  -- What actually happened
  verification_date date NOT NULL,
  actual_value text NOT NULL,
  -- Accuracy
  was_accurate boolean NOT NULL,
  error_magnitude numeric(5,2), -- distance between prediction and reality
  -- Meta
  days_ahead smallint NOT NULL, -- how far ahead the prediction was
  model_version text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calibration_type ON claude_calibration_log(prediction_type, was_accurate);
CREATE INDEX IF NOT EXISTS idx_calibration_user ON claude_calibration_log(user_id, prediction_date DESC);
CREATE INDEX IF NOT EXISTS idx_calibration_org ON claude_calibration_log(org_id, prediction_date DESC);

ALTER TABLE claude_calibration_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calibration_org_read" ON claude_calibration_log FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "calibration_service_write" ON claude_calibration_log FOR INSERT WITH CHECK (true);

-- ============================================================
-- 8. FIRST ENTRY PREDICTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS first_entry_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  -- Prediction
  predicted_hour numeric(4,1) NOT NULL, -- e.g. 8.5 = 8:30am
  predicted_stddev numeric(4,1),
  -- Actual
  actual_hour numeric(4,1), -- null if no entry logged
  actual_logged_at timestamptz,
  -- Analysis
  deviation_hours numeric(4,1), -- actual - predicted
  was_late boolean, -- actual > predicted + 1 stddev
  was_no_show boolean DEFAULT false, -- no entry at all
  -- Context
  day_of_week smallint, -- 0=Sun
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, org_id, date)
);

CREATE INDEX IF NOT EXISTS idx_first_entry_user ON first_entry_predictions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_first_entry_late ON first_entry_predictions(org_id, date) WHERE was_late = true OR was_no_show = true;

ALTER TABLE first_entry_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "first_entry_org_read" ON first_entry_predictions FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "first_entry_service_write" ON first_entry_predictions FOR INSERT WITH CHECK (true);
CREATE POLICY "first_entry_service_update" ON first_entry_predictions FOR UPDATE USING (true);

-- ============================================================
-- 9. VOCABULARY PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS vocabulary_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  computed_date date NOT NULL,
  -- Vocabulary stats
  unique_words smallint NOT NULL DEFAULT 0,
  total_words int NOT NULL DEFAULT 0,
  vocabulary_richness numeric(5,3), -- unique/total
  avg_word_length numeric(4,1),
  -- Top words (frequency map)
  word_frequencies jsonb, -- {"code": 45, "meeting": 30, ...} top 50
  -- Anomaly detection
  new_words_this_week text[], -- words never seen before in this person's history
  similarity_to_self numeric(5,3), -- cosine similarity to their own previous vocabulary
  similarity_to_team_avg numeric(5,3), -- cosine similarity to team vocabulary
  -- Flags
  possible_ai_generated boolean DEFAULT false, -- vocabulary suddenly richer than baseline
  possible_copy boolean DEFAULT false, -- high similarity to another user's recent entries
  copy_source_user_id uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, org_id, computed_date)
);

CREATE INDEX IF NOT EXISTS idx_vocab_user ON vocabulary_profiles(user_id, computed_date DESC);
CREATE INDEX IF NOT EXISTS idx_vocab_flags ON vocabulary_profiles(org_id) WHERE possible_ai_generated = true OR possible_copy = true;

ALTER TABLE vocabulary_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vocab_org_read" ON vocabulary_profiles FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "vocab_service_write" ON vocabulary_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "vocab_service_update" ON vocabulary_profiles FOR UPDATE USING (true);
