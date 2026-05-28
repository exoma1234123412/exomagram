-- ============================================
-- EXOMAGRAM V4 - Full Feature Set
-- GitHub, AI Review, Focus, Standups, Audit,
-- Shoutouts, Goals, Pomodoro, Notifications
-- ============================================

-- ============================================
-- GITHUB INTEGRATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS github_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  github_username TEXT NOT NULL,
  github_token TEXT, -- encrypted personal access token
  repos TEXT[] NOT NULL DEFAULT '{}',
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id)
);

CREATE TABLE IF NOT EXISTS github_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('commit', 'pr_opened', 'pr_merged', 'pr_reviewed', 'issue_opened', 'issue_closed')),
  repo TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  sha TEXT,
  date DATE NOT NULL,
  hour INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE github_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own github connections" ON github_connections FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Members can view org github events" ON github_events FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "System can insert github events" ON github_events FOR INSERT WITH CHECK (true);

-- ============================================
-- AI REVIEWS
-- ============================================

CREATE TABLE IF NOT EXISTS ai_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- null = team-wide review
  review_type TEXT NOT NULL CHECK (review_type IN ('daily_individual', 'daily_team', 'weekly_retro')),
  findings JSONB NOT NULL, -- array of {type, severity, message, entry_ids}
  summary TEXT NOT NULL,
  trust_impact INTEGER DEFAULT 0, -- +/- impact on trust score
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view org ai reviews" ON ai_reviews FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "System can insert ai reviews" ON ai_reviews FOR INSERT WITH CHECK (true);

-- ============================================
-- ASYNC STANDUPS
-- ============================================

CREATE TABLE IF NOT EXISTS standups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  yesterday TEXT NOT NULL,
  today_plan TEXT NOT NULL,
  blockers TEXT,
  mood SMALLINT CHECK (mood >= 1 AND mood <= 5),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id, date)
);

ALTER TABLE standups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view org standups" ON standups FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own standups" ON standups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own standups" ON standups FOR UPDATE USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE standups;

-- ============================================
-- AUDIT LOG (immutable)
-- ============================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN (
    'entry_created', 'entry_updated', 'entry_deleted',
    'closeout_submitted', 'standup_submitted',
    'reaction_added', 'reaction_removed',
    'flag_created', 'flag_resolved',
    'profile_updated', 'member_joined', 'member_removed',
    'goal_created', 'goal_updated', 'shoutout_given'
  )),
  target_type TEXT, -- 'time_entry', 'closeout', 'standup', etc
  target_id UUID,
  old_data JSONB, -- previous state (for updates)
  new_data JSONB, -- new state
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view org audit log" ON audit_log FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "System can insert audit log" ON audit_log FOR INSERT WITH CHECK (true);

CREATE INDEX idx_audit_log_org_date ON audit_log(org_id, created_at);
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at);
CREATE INDEX idx_audit_log_target ON audit_log(target_type, target_id);

-- ============================================
-- SHOUTOUTS
-- ============================================

CREATE TABLE IF NOT EXISTS shoutouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('helped_me', 'great_work', 'team_player', 'problem_solver', 'above_and_beyond')),
  entry_id UUID REFERENCES time_entries(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shoutouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view org shoutouts" ON shoutouts FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "Users can give shoutouts" ON shoutouts FOR INSERT WITH CHECK (auth.uid() = from_user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE shoutouts;

-- ============================================
-- GOALS
-- ============================================

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  target_hours INTEGER, -- optional: hours to dedicate
  target_category TEXT, -- optional: specific category
  period TEXT NOT NULL CHECK (period IN ('weekly', 'monthly')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view org goals" ON goals FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage own goals" ON goals FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- POMODORO SESSIONS
-- ============================================

CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_title TEXT NOT NULL,
  category TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 25,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  was_interrupted BOOLEAN NOT NULL DEFAULT false,
  entry_id UUID REFERENCES time_entries(id) ON DELETE SET NULL -- linked time entry
);

ALTER TABLE pomodoro_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view org pomodoros" ON pomodoro_sessions FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage own pomodoros" ON pomodoro_sessions FOR ALL USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE pomodoro_sessions;

-- ============================================
-- NOTIFICATIONS / ACTIVITY FEED
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'entry_logged', 'shoutout_received', 'reaction_received',
    'flag_raised', 'standup_reminder', 'closeout_reminder',
    'verification_request', 'goal_completed', 'streak_milestone'
  )),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  from_user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at);

-- ============================================
-- MEETING CROSS-VERIFICATION
-- ============================================

CREATE TABLE IF NOT EXISTS meeting_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  verifier_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'denied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE(entry_id, verifier_id)
);

ALTER TABLE meeting_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view org verifications" ON meeting_verifications FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "Users can create verification requests" ON meeting_verifications FOR INSERT
  WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Verifiers can respond" ON meeting_verifications FOR UPDATE
  USING (auth.uid() = verifier_id);

-- ============================================
-- PUBLIC DASHBOARD TOKENS
-- ============================================

CREATE TABLE IF NOT EXISTS public_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  label TEXT NOT NULL DEFAULT 'Dashboard público',
  show_names BOOLEAN NOT NULL DEFAULT true,
  show_details BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public_dashboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can manage org public dashboards" ON public_dashboards FOR ALL
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

-- ============================================
-- PROJECT TAGGING
-- ============================================

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS project TEXT;
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(org_id, project);

-- ============================================
-- ACHIEVEMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  achievement_type TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id, achievement_type)
);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org achievements"
  ON achievements FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "System can insert achievements"
  ON achievements FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- ENTRY COMMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS entry_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_entry_comments_entry ON entry_comments(entry_id, created_at);

ALTER TABLE entry_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view entry comments"
  ON entry_comments FOR SELECT
  USING (
    entry_id IN (
      SELECT id FROM time_entries WHERE org_id IN (
        SELECT org_id FROM org_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Authenticated users can comment"
  ON entry_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON entry_comments FOR DELETE
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE entry_comments;

-- ============================================
-- ACCOUNTABILITY PACTS
-- ============================================

CREATE TABLE IF NOT EXISTS accountability_pacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('hours_with_proof', 'total_hours', 'proof_percent', 'closeout_days')),
  target_value INTEGER NOT NULL,
  duration_days INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
  creator_progress INTEGER NOT NULL DEFAULT 0,
  partner_progress INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE accountability_pacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org pacts"
  ON accountability_pacts FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can create pacts"
  ON accountability_pacts FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Participants can update pacts"
  ON accountability_pacts FOR UPDATE
  USING (auth.uid() IN (creator_id, partner_id));

ALTER PUBLICATION supabase_realtime ADD TABLE accountability_pacts;

-- ============================================
-- PULSE SURVEYS
-- ============================================

CREATE TABLE IF NOT EXISTS pulse_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  week DATE NOT NULL, -- week start date
  question_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id, week, question_id)
);

ALTER TABLE pulse_responses ENABLE ROW LEVEL SECURITY;

-- Anonymous: members can see aggregate scores but not who responded
CREATE POLICY "Members can view org pulse aggregates"
  ON pulse_responses FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can submit pulse"
  ON pulse_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pulse"
  ON pulse_responses FOR UPDATE
  USING (auth.uid() = user_id);
