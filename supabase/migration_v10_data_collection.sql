-- ============================================================
-- V10: Insane Data Collection Expansion
-- Adds 16 new columns to time_entries + 5 new collection tables
-- ============================================================

-- ============================================================
-- 1. New columns on time_entries
-- ============================================================

-- Subjective ratings (1-5 scales)
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS difficulty smallint CHECK (difficulty BETWEEN 1 AND 5);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS focus_quality smallint CHECK (focus_quality BETWEEN 1 AND 5);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS value_rating smallint CHECK (value_rating BETWEEN 1 AND 5);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS stress_level smallint CHECK (stress_level BETWEEN 1 AND 5);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS confidence smallint CHECK (confidence BETWEEN 1 AND 5);

-- Quantitative counts
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS interruptions smallint DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS context_switches smallint DEFAULT 0;

-- Collaboration
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS collaborators text[] DEFAULT '{}';

-- Output classification
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS output_type text CHECK (output_type IN (
  'code', 'document', 'design', 'email', 'decision', 'analysis',
  'presentation', 'communication', 'review_output', 'none'
));

-- Tools and environment
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS tools_used text[] DEFAULT '{}';
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS location text CHECK (location IN (
  'office', 'home', 'cafe', 'coworking', 'travel', 'other'
));

-- Classification flags
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS client_facing boolean DEFAULT false;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS could_be_async boolean;

-- Detailed context
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS blocker_detail text;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS skills_tags text[] DEFAULT '{}';
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS learning_notes text;

-- ============================================================
-- 2. daily_health — Daily wellness check-in
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  -- Sleep
  sleep_hours numeric(3,1) CHECK (sleep_hours BETWEEN 0 AND 24),
  sleep_quality smallint CHECK (sleep_quality BETWEEN 1 AND 5),
  -- Physical
  exercise_minutes smallint DEFAULT 0,
  exercise_type text, -- running, gym, yoga, walk, cycling, none
  hydration_level smallint CHECK (hydration_level BETWEEN 1 AND 5),
  meals_count smallint CHECK (meals_count BETWEEN 0 AND 10),
  -- Mental
  stress_morning smallint CHECK (stress_morning BETWEEN 1 AND 5),
  stress_evening smallint CHECK (stress_evening BETWEEN 1 AND 5),
  mental_clarity smallint CHECK (mental_clarity BETWEEN 1 AND 5),
  motivation_level smallint CHECK (motivation_level BETWEEN 1 AND 5),
  -- Screen & work
  screen_time_hours numeric(4,1) DEFAULT 0,
  breaks_taken smallint DEFAULT 0,
  -- Context
  worked_overtime boolean DEFAULT false,
  personal_issues boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, org_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_health_user_date ON daily_health(user_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_health_org_date ON daily_health(org_id, date);

ALTER TABLE daily_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_health_org_read" ON daily_health FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "daily_health_self_write" ON daily_health FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "daily_health_self_update" ON daily_health FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================
-- 3. weekly_reflections — Deep weekly retrospective
-- ============================================================
CREATE TABLE IF NOT EXISTS weekly_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  week_start date NOT NULL,
  -- Wins & struggles
  biggest_win text,
  biggest_struggle text,
  what_learned text,
  what_would_change text,
  -- Forward-looking
  next_week_priorities text[] DEFAULT '{}',
  goals_hit_percent smallint CHECK (goals_hit_percent BETWEEN 0 AND 100),
  -- Ratings
  satisfaction smallint CHECK (satisfaction BETWEEN 1 AND 5),
  work_life_balance smallint CHECK (work_life_balance BETWEEN 1 AND 5),
  team_collaboration smallint CHECK (team_collaboration BETWEEN 1 AND 5),
  growth_feeling smallint CHECK (growth_feeling BETWEEN 1 AND 5),
  manager_support smallint CHECK (manager_support BETWEEN 1 AND 5),
  -- Growth
  growth_areas text[] DEFAULT '{}',
  skills_developed text[] DEFAULT '{}',
  -- Meta
  would_recommend_week boolean,
  one_word_summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, org_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reflections_user ON weekly_reflections(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_reflections_org ON weekly_reflections(org_id, week_start);

ALTER TABLE weekly_reflections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weekly_reflections_org_read" ON weekly_reflections FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "weekly_reflections_self_write" ON weekly_reflections FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "weekly_reflections_self_update" ON weekly_reflections FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================
-- 4. focus_sessions — Deep work session tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS focus_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  -- Timing
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  planned_minutes smallint NOT NULL DEFAULT 60,
  actual_minutes smallint,
  -- Context
  task_title text NOT NULL,
  category text, -- work_category
  project text,
  -- Quality
  was_completed boolean DEFAULT false,
  interruption_count smallint DEFAULT 0,
  interruption_sources text[] DEFAULT '{}', -- slack, colleague, phone, email, meeting, self
  quality_rating smallint CHECK (quality_rating BETWEEN 1 AND 5),
  flow_state_achieved boolean DEFAULT false,
  -- Output
  deliverables text, -- what was produced
  -- Links
  entry_id uuid REFERENCES time_entries(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_user ON focus_sessions(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_org ON focus_sessions(org_id, started_at);

ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "focus_sessions_org_read" ON focus_sessions FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "focus_sessions_self_write" ON focus_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "focus_sessions_self_update" ON focus_sessions FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================
-- 5. communication_log — Daily comms metrics
-- ============================================================
CREATE TABLE IF NOT EXISTS communication_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  -- Counts
  messages_sent smallint DEFAULT 0,
  messages_received smallint DEFAULT 0,
  meetings_attended smallint DEFAULT 0,
  meetings_organized smallint DEFAULT 0,
  emails_sent smallint DEFAULT 0,
  emails_received smallint DEFAULT 0,
  -- Time
  meeting_minutes smallint DEFAULT 0,
  slack_active_minutes smallint DEFAULT 0,
  response_time_avg_minutes numeric(6,1),
  -- Quality
  channels_active text[] DEFAULT '{}',
  people_interacted_with text[] DEFAULT '{}',
  unread_at_eod smallint DEFAULT 0,
  -- Source
  source text DEFAULT 'manual', -- manual, slack_sync, calendar_sync
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, org_id, date)
);

CREATE INDEX IF NOT EXISTS idx_communication_log_user ON communication_log(user_id, date);
CREATE INDEX IF NOT EXISTS idx_communication_log_org ON communication_log(org_id, date);

ALTER TABLE communication_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "communication_log_org_read" ON communication_log FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "communication_log_self_write" ON communication_log FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "communication_log_self_update" ON communication_log FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================
-- 6. git_daily_metrics — Detailed git stats per day
-- ============================================================
CREATE TABLE IF NOT EXISTS git_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  -- Volume
  commits_count smallint DEFAULT 0,
  lines_added int DEFAULT 0,
  lines_removed int DEFAULT 0,
  files_changed smallint DEFAULT 0,
  -- PRs
  prs_opened smallint DEFAULT 0,
  prs_merged smallint DEFAULT 0,
  prs_reviewed smallint DEFAULT 0,
  review_comments smallint DEFAULT 0,
  avg_pr_size_lines int DEFAULT 0,
  -- Context
  repos_active text[] DEFAULT '{}',
  languages text[] DEFAULT '{}',
  largest_commit_files smallint DEFAULT 0,
  -- Quality signals
  tests_added smallint DEFAULT 0,
  docs_changed boolean DEFAULT false,
  ci_failures smallint DEFAULT 0,
  -- Source
  source text DEFAULT 'github_sync',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, org_id, date)
);

CREATE INDEX IF NOT EXISTS idx_git_daily_metrics_user ON git_daily_metrics(user_id, date);
CREATE INDEX IF NOT EXISTS idx_git_daily_metrics_org ON git_daily_metrics(org_id, date);

ALTER TABLE git_daily_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "git_daily_metrics_org_read" ON git_daily_metrics FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "git_daily_metrics_self_write" ON git_daily_metrics FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "git_daily_metrics_self_update" ON git_daily_metrics FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================
-- Enable realtime on new tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE daily_health;
ALTER PUBLICATION supabase_realtime ADD TABLE focus_sessions;
