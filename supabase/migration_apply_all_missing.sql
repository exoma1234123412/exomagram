-- ============================================================
-- MASTER MIGRATION: Creates all 28 missing tables
-- Safe to run multiple times (IF NOT EXISTS everywhere)
-- ============================================================

-- ═══════ V4: Core features ═══════

CREATE TABLE IF NOT EXISTS org_settings (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  expected_daily_hours NUMERIC DEFAULT 8,
  work_hour_start INTEGER DEFAULT 7,
  work_hour_end INTEGER DEFAULT 18,
  proof_requirement TEXT DEFAULT 'encouraged' CHECK (proof_requirement IN ('none','encouraged','required')),
  max_backfill_hours INTEGER DEFAULT 24,
  min_title_length INTEGER DEFAULT 10,
  weekend_logging BOOLEAN DEFAULT false,
  auto_flag_missing_hours BOOLEAN DEFAULT true,
  auto_flag_no_proof BOOLEAN DEFAULT true,
  auto_flag_late BOOLEAN DEFAULT true,
  require_closeout BOOLEAN DEFAULT true,
  trust_hours_weight NUMERIC DEFAULT 0.3,
  trust_proof_weight NUMERIC DEFAULT 0.3,
  trust_closeout_weight NUMERIC DEFAULT 0.2,
  trust_late_penalty NUMERIC DEFAULT 0.1,
  trust_suspicious_penalty NUMERIC DEFAULT 0.1,
  daily_digest_email BOOLEAN DEFAULT false,
  slack_webhook_url TEXT,
  flag_notifications BOOLEAN DEFAULT true,
  closeout_reminder BOOLEAN DEFAULT true,
  closeout_reminder_hour INTEGER DEFAULT 17,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='org_settings' AND policyname='org members can view settings') THEN
    CREATE POLICY "org members can view settings" ON org_settings FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='org_settings' AND policyname='org admins can update settings') THEN
    CREATE POLICY "org admins can update settings" ON org_settings FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  token TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','cancelled')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  accepted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days')
);
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invitations' AND policyname='org members can view invitations') THEN
    CREATE POLICY "org members can view invitations" ON invitations FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invitations' AND policyname='org admins can manage invitations') THEN
    CREATE POLICY "org admins can manage invitations" ON invitations FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  goal_hours_per_person NUMERIC,
  goal_category_focus JSONB,
  status TEXT DEFAULT 'planning' CHECK (status IN ('planning','active','completed','cancelled')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sprints' AND policyname='org members can view sprints') THEN
    CREATE POLICY "org members can view sprints" ON sprints FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sprints' AND policyname='org members can manage sprints') THEN
    CREATE POLICY "org members can manage sprints" ON sprints FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS saved_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  report_type TEXT DEFAULT 'performance' CHECK (report_type IN ('client','executive','performance','project')),
  config JSONB DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_run_at TIMESTAMPTZ
);
ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_reports' AND policyname='org members can manage reports') THEN
    CREATE POLICY "org members can manage reports" ON saved_reports FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'disconnected',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='integration_configs' AND policyname='org admins can manage integrations') THEN
    CREATE POLICY "org admins can manage integrations" ON integration_configs FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  permissions TEXT[] DEFAULT '{}',
  rate_limit INTEGER DEFAULT 1000,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='api_keys' AND policyname='org admins can manage api keys') THEN
    CREATE POLICY "org admins can manage api keys" ON api_keys FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS subscriptions (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise')),
  billing_cycle TEXT DEFAULT 'monthly',
  member_limit INTEGER DEFAULT 10,
  features JSONB DEFAULT '{}',
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ DEFAULT now(),
  current_period_end TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='org members can view subscription') THEN
    CREATE POLICY "org members can view subscription" ON subscriptions FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  status_code INTEGER,
  response_body TEXT,
  success BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='webhook_deliveries' AND policyname='org admins can view webhooks') THEN
    CREATE POLICY "org admins can view webhooks" ON webhook_deliveries FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));
  END IF;
END $$;

-- ═══════ V6: Promises, Rankings, etc ═══════

CREATE TABLE IF NOT EXISTS buddy_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_a UUID NOT NULL REFERENCES auth.users(id),
  user_b UUID NOT NULL REFERENCES auth.users(id),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE buddy_pairs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='buddy_pairs' AND policyname='org members can view buddies') THEN
    CREATE POLICY "org members can view buddies" ON buddy_pairs FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS mirror_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tier TEXT DEFAULT 'bronze',
  score NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE mirror_tiers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mirror_tiers' AND policyname='org members can view tiers') THEN
    CREATE POLICY "org members can view tiers" ON mirror_tiers FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS power_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  total INTEGER NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE power_rankings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='power_rankings' AND policyname='org members can view rankings') THEN
    CREATE POLICY "org members can view rankings" ON power_rankings FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  week_of DATE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='journal_entries' AND policyname='org members can manage journals') THEN
    CREATE POLICY "org members can manage journals" ON journal_entries FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

-- ═══════ V7: Creative Features ═══════

CREATE TABLE IF NOT EXISTS tribunal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  entry_id UUID NOT NULL,
  nominated_user_id UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT,
  status TEXT DEFAULT 'voting' CHECK (status IN ('voting','guilty','innocent','expired')),
  guilty_votes INTEGER DEFAULT 0,
  innocent_votes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE tribunal_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tribunal_sessions' AND policyname='org members can manage tribunal') THEN
    CREATE POLICY "org members can manage tribunal" ON tribunal_sessions FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tribunal_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES tribunal_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  vote TEXT NOT NULL CHECK (vote IN ('guilty','innocent')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE tribunal_votes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tribunal_votes' AND policyname='users can manage votes') THEN
    CREATE POLICY "users can manage votes" ON tribunal_votes FOR ALL USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  question TEXT NOT NULL,
  type TEXT DEFAULT 'yes_no',
  resolution_date DATE NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','resolved_yes','resolved_no','cancelled')),
  actual_value TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='predictions' AND policyname='org members can manage predictions') THEN
    CREATE POLICY "org members can manage predictions" ON predictions FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS prediction_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  bet TEXT NOT NULL,
  confidence NUMERIC DEFAULT 50,
  is_correct BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE prediction_bets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='prediction_bets' AND policyname='users can manage bets') THEN
    CREATE POLICY "users can manage bets" ON prediction_bets FOR ALL USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS focus_duels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  challenger_id UUID NOT NULL REFERENCES auth.users(id),
  opponent_id UUID NOT NULL REFERENCES auth.users(id),
  date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','completed','declined')),
  challenger_hours NUMERIC DEFAULT 0,
  opponent_hours NUMERIC DEFAULT 0,
  winner_id UUID REFERENCES auth.users(id),
  loser_confession TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE focus_duels ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='focus_duels' AND policyname='org members can manage duels') THEN
    CREATE POLICY "org members can manage duels" ON focus_duels FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS meeting_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rating NUMERIC DEFAULT 3,
  would_skip BOOLEAN DEFAULT false,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE meeting_ratings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meeting_ratings' AND policyname='org members can manage ratings') THEN
    CREATE POLICY "org members can manage ratings" ON meeting_ratings FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS panic_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reason TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','rescued','resolved')),
  rescued_by UUID REFERENCES auth.users(id),
  rescued_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE panic_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='panic_events' AND policyname='org members can manage panics') THEN
    CREATE POLICY "org members can manage panics" ON panic_events FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS weekly_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  commitments JSONB DEFAULT '[]',
  overall_grade TEXT,
  ai_assessment TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','graded')),
  created_at TIMESTAMPTZ DEFAULT now(),
  graded_at TIMESTAMPTZ,
  UNIQUE (user_id, org_id, week_start)
);
ALTER TABLE weekly_contracts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='weekly_contracts' AND policyname='org members can manage contracts') THEN
    CREATE POLICY "org members can manage contracts" ON weekly_contracts FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS roulette_pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  user_a UUID NOT NULL REFERENCES auth.users(id),
  user_b UUID NOT NULL REFERENCES auth.users(id),
  triggered_at TIMESTAMPTZ,
  user_a_verified BOOLEAN DEFAULT false,
  user_b_verified BOOLEAN DEFAULT false,
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE roulette_pairings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='roulette_pairings' AND policyname='org members can manage pairings') THEN
    CREATE POLICY "org members can manage pairings" ON roulette_pairings FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

-- ═══════ V9: Unconventional Features ═══════

CREATE TABLE IF NOT EXISTS deadman_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ DEFAULT now(),
  hours_missing NUMERIC DEFAULT 4,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','acknowledged','resolved')),
  acknowledged_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_deadman_org ON deadman_alerts(org_id, status);
ALTER TABLE deadman_alerts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='deadman_alerts' AND policyname='org members can manage deadman') THEN
    CREATE POLICY "org members can manage deadman" ON deadman_alerts FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS task_auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  max_hours NUMERIC DEFAULT 8,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','claimed','completed','failed')),
  winner_id UUID REFERENCES auth.users(id),
  winning_bid NUMERIC,
  deadline TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auctions_org ON task_auctions(org_id, status);
ALTER TABLE task_auctions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='task_auctions' AND policyname='org members can manage auctions') THEN
    CREATE POLICY "org members can manage auctions" ON task_auctions FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS auction_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES task_auctions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  hours_bid NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE auction_bids ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='auction_bids' AND policyname='users can manage bids') THEN
    CREATE POLICY "users can manage bids" ON auction_bids FOR ALL USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS audit_lotteries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  selected_user_id UUID NOT NULL REFERENCES auth.users(id),
  findings JSONB,
  passed BOOLEAN,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','auditing','passed','failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, date)
);
ALTER TABLE audit_lotteries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audit_lotteries' AND policyname='org members can manage lotteries') THEN
    CREATE POLICY "org members can manage lotteries" ON audit_lotteries FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS trust_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id UUID NOT NULL REFERENCES auth.users(id),
  target_id UUID NOT NULL REFERENCES auth.users(id),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount NUMERIC DEFAULT 0,
  invested_at TIMESTAMPTZ DEFAULT now(),
  current_value NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','sold')),
  sold_at TIMESTAMPTZ
);
ALTER TABLE trust_investments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trust_investments' AND policyname='org members can manage investments') THEN
    CREATE POLICY "org members can manage investments" ON trust_investments FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS monthly_obituaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  content TEXT NOT NULL,
  ai_generated BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, org_id, month)
);
ALTER TABLE monthly_obituaries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='monthly_obituaries' AND policyname='org members can manage obituaries') THEN
    CREATE POLICY "org members can manage obituaries" ON monthly_obituaries FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

-- ═══════ V12: Projects ═══════

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','completed')),
  color TEXT DEFAULT 'blue',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='org members can view projects') THEN
    CREATE POLICY "org members can view projects" ON projects FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='org members can insert projects') THEN
    CREATE POLICY "org members can insert projects" ON projects FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='org members can update projects') THEN
    CREATE POLICY "org members can update projects" ON projects FOR UPDATE USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
  END IF;
END $$;

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project_id ON time_entries(project_id);

-- ═══════ Proof Files Storage Bucket ═══════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proof-files', 'proof-files', true, 10485760,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','image/heic','application/pdf','video/mp4','video/quicktime','audio/mpeg','audio/mp4']
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Users can upload proof files') THEN
    CREATE POLICY "Users can upload proof files" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'proof-files' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Anyone can view proof files') THEN
    CREATE POLICY "Anyone can view proof files" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'proof-files');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Users can delete own proof files') THEN
    CREATE POLICY "Users can delete own proof files" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'proof-files' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;
