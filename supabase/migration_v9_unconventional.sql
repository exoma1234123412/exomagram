-- ============================================================
-- V9: Unconventional Features
-- Dead Man's Switch, Task Auctions, Audit Lottery,
-- Trust Market, Monthly Obituaries
-- ============================================================

-- Dead Man's Switch alerts
CREATE TABLE IF NOT EXISTS deadman_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hours_missing NUMERIC NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
  acknowledged_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deadman_org_status ON deadman_alerts(org_id, status);
CREATE INDEX IF NOT EXISTS idx_deadman_user ON deadman_alerts(user_id, org_id);

ALTER TABLE deadman_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view deadman alerts"
  ON deadman_alerts FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Org members can insert deadman alerts"
  ON deadman_alerts FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Org members can update deadman alerts"
  ON deadman_alerts FOR UPDATE
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));


-- Task Auctions
CREATE TABLE IF NOT EXISTS task_auctions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  max_hours NUMERIC NOT NULL DEFAULT 8,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'completed', 'failed')),
  winner_id UUID REFERENCES auth.users(id),
  winning_bid NUMERIC,
  deadline TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auctions_org_status ON task_auctions(org_id, status);

ALTER TABLE task_auctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view auctions"
  ON task_auctions FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Org members can create auctions"
  ON task_auctions FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Org members can update auctions"
  ON task_auctions FOR UPDATE
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));


-- Auction Bids
CREATE TABLE IF NOT EXISTS auction_bids (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auction_id UUID NOT NULL REFERENCES task_auctions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hours_bid NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bids_auction ON auction_bids(auction_id);

ALTER TABLE auction_bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view bids"
  ON auction_bids FOR SELECT
  USING (auction_id IN (SELECT id FROM task_auctions WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())));

CREATE POLICY "Org members can create bids"
  ON auction_bids FOR INSERT
  WITH CHECK (auction_id IN (SELECT id FROM task_auctions WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())));

CREATE POLICY "Users can delete own bids"
  ON auction_bids FOR DELETE
  USING (user_id = auth.uid());


-- Audit Lottery
CREATE TABLE IF NOT EXISTS audit_lotteries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  selected_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  findings JSONB,
  passed BOOLEAN,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'auditing', 'passed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, date)
);

CREATE INDEX IF NOT EXISTS idx_lottery_org ON audit_lotteries(org_id);

ALTER TABLE audit_lotteries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view lotteries"
  ON audit_lotteries FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Org members can create lotteries"
  ON audit_lotteries FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Org members can update lotteries"
  ON audit_lotteries FOR UPDATE
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));


-- Trust Investments (Trust Market)
CREATE TABLE IF NOT EXISTS trust_investments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  investor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  invested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_value NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold')),
  sold_at TIMESTAMPTZ,
  CHECK (investor_id != target_id)
);

CREATE INDEX IF NOT EXISTS idx_investments_org ON trust_investments(org_id);
CREATE INDEX IF NOT EXISTS idx_investments_investor ON trust_investments(investor_id, org_id);
CREATE INDEX IF NOT EXISTS idx_investments_target ON trust_investments(target_id, org_id);

ALTER TABLE trust_investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view investments"
  ON trust_investments FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can create investments"
  ON trust_investments FOR INSERT
  WITH CHECK (investor_id = auth.uid() AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Investors can update own investments"
  ON trust_investments FOR UPDATE
  USING (investor_id = auth.uid());


-- Monthly Obituaries
CREATE TABLE IF NOT EXISTS monthly_obituaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- "2026-05"
  content TEXT NOT NULL,
  ai_generated BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id, month)
);

CREATE INDEX IF NOT EXISTS idx_obituaries_org ON monthly_obituaries(org_id, month);

ALTER TABLE monthly_obituaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view obituaries"
  ON monthly_obituaries FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Org members can insert obituaries"
  ON monthly_obituaries FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Org members can update obituaries"
  ON monthly_obituaries FOR UPDATE
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
