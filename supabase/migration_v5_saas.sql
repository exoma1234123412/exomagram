-- ============================================
-- EXOMAGRAM V5 - Full SaaS Infrastructure
-- Multi-org, Invitations, Sprints, Reports,
-- Integrations, Capacity, API Keys
-- ============================================

-- ============================================
-- ORG SETTINGS (configurable per org)
-- ============================================

CREATE TABLE IF NOT EXISTS org_settings (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  expected_daily_hours INTEGER NOT NULL DEFAULT 8,
  work_hour_start INTEGER NOT NULL DEFAULT 7,
  work_hour_end INTEGER NOT NULL DEFAULT 18,
  proof_requirement TEXT NOT NULL DEFAULT 'encouraged' CHECK (proof_requirement IN ('none', 'encouraged', 'required')),
  max_backfill_hours INTEGER NOT NULL DEFAULT 24,
  min_title_length INTEGER NOT NULL DEFAULT 10,
  weekend_logging BOOLEAN NOT NULL DEFAULT false,
  auto_flag_missing_hours BOOLEAN NOT NULL DEFAULT true,
  auto_flag_no_proof BOOLEAN NOT NULL DEFAULT true,
  auto_flag_late BOOLEAN NOT NULL DEFAULT true,
  require_closeout BOOLEAN NOT NULL DEFAULT false,
  trust_hours_weight INTEGER NOT NULL DEFAULT 40,
  trust_proof_weight INTEGER NOT NULL DEFAULT 40,
  trust_closeout_weight INTEGER NOT NULL DEFAULT 10,
  trust_late_penalty INTEGER NOT NULL DEFAULT 20,
  trust_suspicious_penalty INTEGER NOT NULL DEFAULT 10,
  daily_digest_email BOOLEAN NOT NULL DEFAULT false,
  slack_webhook_url TEXT,
  flag_notifications BOOLEAN NOT NULL DEFAULT true,
  closeout_reminder BOOLEAN NOT NULL DEFAULT true,
  closeout_reminder_hour INTEGER NOT NULL DEFAULT 17,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org settings"
  ON org_settings FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Admins can update org settings"
  ON org_settings FOR ALL
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- ============================================
-- TEAM INVITATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role org_role NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  invited_by UUID NOT NULL REFERENCES profiles(id),
  accepted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE(org_id, email, status)
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org invitations"
  ON invitations FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage invitations"
  ON invitations FOR ALL
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email, status);

-- ============================================
-- SPRINTS / WORK CYCLES
-- ============================================

CREATE TABLE IF NOT EXISTS sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  goal_hours_per_person INTEGER,
  goal_category_focus JSONB, -- { "deep_work": 80, "meeting": 10 }
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planning', 'active', 'completed', 'cancelled')),
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org sprints"
  ON sprints FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage sprints"
  ON sprints FOR ALL
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- ============================================
-- SAVED REPORTS
-- ============================================

CREATE TABLE IF NOT EXISTS saved_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  report_type TEXT NOT NULL CHECK (report_type IN ('client', 'executive', 'performance', 'project')),
  config JSONB NOT NULL, -- filters, date range, included fields
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at TIMESTAMPTZ
);

ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org reports"
  ON saved_reports FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Members can manage own reports"
  ON saved_reports FOR ALL
  USING (created_by = auth.uid());

-- ============================================
-- INTEGRATION CONFIGS
-- ============================================

CREATE TABLE IF NOT EXISTS integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'slack', 'google_calendar', 'linear', 'notion', 'zapier', 'custom_webhook')),
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, provider)
);

ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage integrations"
  ON integration_configs FOR ALL
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- ============================================
-- API KEYS
-- ============================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL, -- hashed key, never store plaintext
  key_prefix TEXT NOT NULL, -- first 8 chars for display: "exo_abc1..."
  permissions TEXT[] NOT NULL DEFAULT ARRAY['read'],
  rate_limit INTEGER NOT NULL DEFAULT 1000, -- requests per hour
  created_by UUID NOT NULL REFERENCES profiles(id),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage API keys"
  ON api_keys FOR ALL
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- ============================================
-- SUBSCRIPTION / BILLING (plan tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS subscriptions (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  member_limit INTEGER NOT NULL DEFAULT 5,
  features JSONB NOT NULL DEFAULT '{}',
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view subscription"
  ON subscriptions FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Owners can manage subscription"
  ON subscriptions FOR ALL
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role = 'owner'));

-- ============================================
-- WEBHOOK DELIVERIES (for outgoing webhooks)
-- ============================================

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status_code INTEGER,
  response_body TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook deliveries"
  ON webhook_deliveries FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

CREATE INDEX idx_webhook_deliveries_org ON webhook_deliveries(org_id, created_at);

-- ============================================
-- Add org description field
-- ============================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

-- ============================================
-- INDEXES for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_time_entries_org_project_date ON time_entries(org_id, project, date);
CREATE INDEX IF NOT EXISTS idx_sprints_org_status ON sprints(org_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(org_id, status);
