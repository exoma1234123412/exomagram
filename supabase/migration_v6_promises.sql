-- ============================================================
-- Migration v6: Missing tables referenced in code
-- daily_promises, buddy_pairs, mirror_tiers, power_rankings,
-- ai_work_profiles, ai_daily_insights, public_feed,
-- weekly_summaries, journal_entries
-- ============================================================

-- ============================================================
-- DAILY PROMISES
-- Public commitments per user per day. Team can see all.
-- Columns used: id, user_id, org_id, date, title, status, created_at
-- Joined with: profiles(full_name, avatar_url, role)
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_promises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'broken')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id, date, title)
);

CREATE INDEX IF NOT EXISTS idx_daily_promises_org_date ON daily_promises(org_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_promises_user_date ON daily_promises(user_id, date);

ALTER TABLE daily_promises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org promises"
  ON daily_promises FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own promises"
  ON daily_promises FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own promises"
  ON daily_promises FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on daily_promises"
  ON daily_promises FOR ALL
  USING (auth.role() = 'service_role');

ALTER PUBLICATION supabase_realtime ADD TABLE daily_promises;

-- ============================================================
-- BUDDY PAIRS
-- Accountability buddy system — pairs of users in an org.
-- Columns used: user_a, user_b, org_id, active
-- ============================================================
CREATE TABLE IF NOT EXISTS buddy_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_a UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_a, user_b)
);

CREATE INDEX IF NOT EXISTS idx_buddy_pairs_org ON buddy_pairs(org_id, active);
CREATE INDEX IF NOT EXISTS idx_buddy_pairs_users ON buddy_pairs(user_a, user_b);

ALTER TABLE buddy_pairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org buddy pairs"
  ON buddy_pairs FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage buddy pairs"
  ON buddy_pairs FOR ALL
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- ============================================================
-- MIRROR TIERS
-- Gamification tier per user per org (e.g. Bronze, Silver, Gold).
-- Columns used: user_id, org_id, tier, score
-- ============================================================
CREATE TABLE IF NOT EXISTS mirror_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond')),
  score INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_mirror_tiers_org ON mirror_tiers(org_id);

ALTER TABLE mirror_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org mirror tiers"
  ON mirror_tiers FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on mirror_tiers"
  ON mirror_tiers FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- POWER RANKINGS
-- Ranked leaderboard per org. Updated nightly or on demand.
-- Columns used: user_id, org_id, rank, total
-- ============================================================
CREATE TABLE IF NOT EXISTS power_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_power_rankings_org ON power_rankings(org_id);

ALTER TABLE power_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org power rankings"
  ON power_rankings FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on power_rankings"
  ON power_rankings FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- AI WORK PROFILES
-- Persistent personality/pattern data per person, updated nightly.
-- Columns used: user_id, org_id, profile_data (jsonb), last_updated
-- Upsert on conflict: user_id, org_id
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_work_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_data JSONB NOT NULL DEFAULT '{}',
  last_updated DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_work_profiles_org ON ai_work_profiles(org_id);

ALTER TABLE ai_work_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org ai work profiles"
  ON ai_work_profiles FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on ai_work_profiles"
  ON ai_work_profiles FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- AI DAILY INSIGHTS
-- Structured daily analysis per person, generated by nightly AI processor.
-- Columns used: user_id, org_id, date, insight (jsonb),
--   predictive (jsonb), relationships (jsonb), recommendation (text)
-- Upsert on conflict: user_id, org_id, date
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_daily_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  insight JSONB NOT NULL DEFAULT '{}',
  predictive JSONB DEFAULT '{}',
  relationships JSONB DEFAULT '{}',
  recommendation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ai_daily_insights_org_date ON ai_daily_insights(org_id, date);
CREATE INDEX IF NOT EXISTS idx_ai_daily_insights_user ON ai_daily_insights(user_id, date);

ALTER TABLE ai_daily_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org ai daily insights"
  ON ai_daily_insights FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on ai_daily_insights"
  ON ai_daily_insights FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- PUBLIC FEED
-- AI-generated public feed items visible to the whole org.
-- Columns used: id, org_id, type, title, body, target_user_id,
--   urgency, emoji, is_ai_generated, created_at
-- Real-time subscribed.
-- ============================================================
CREATE TABLE IF NOT EXISTS public_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'ai_announcement' CHECK (type IN (
    'ai_announcement', 'achievement', 'praise', 'milestone',
    'challenge', 'team_update', 'warning', 'shame'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  target_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'critical')),
  emoji TEXT,
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_feed_org_date ON public_feed(org_id, created_at);

ALTER TABLE public_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org public feed"
  ON public_feed FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on public_feed"
  ON public_feed FOR ALL
  USING (auth.role() = 'service_role');

ALTER PUBLICATION supabase_realtime ADD TABLE public_feed;

-- ============================================================
-- WEEKLY SUMMARIES
-- Compressed weekly summaries per person, used as AI "memory".
-- Columns used: user_id, org_id, week_start, week_end,
--   summary (jsonb), ai_narrative (text)
-- Upsert on conflict: user_id, org_id, week_start
-- ============================================================
CREATE TABLE IF NOT EXISTS weekly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}',
  ai_narrative TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_summaries_org ON weekly_summaries(org_id, week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_summaries_user ON weekly_summaries(user_id, org_id, week_start);

ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org weekly summaries"
  ON weekly_summaries FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on weekly_summaries"
  ON weekly_summaries FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- JOURNAL ENTRIES
-- Personal reflection entries per user per week.
-- Columns used: id, user_id, org_id, week_of
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  week_of DATE NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id, week_of)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_org ON journal_entries(user_id, org_id, week_of);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own journal entries"
  ON journal_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own journal entries"
  ON journal_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own journal entries"
  ON journal_entries FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- Add week_of column to pulse_responses if missing
-- (sidebar-indicators queries pulse_responses.week_of but
--  migration_v4 defined it as "week")
-- ============================================================
ALTER TABLE pulse_responses ADD COLUMN IF NOT EXISTS week_of DATE;
