-- ============================================
-- EXOMAGRAM V3 - Trust Score History
-- ============================================

CREATE TABLE IF NOT EXISTS trust_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  hours_logged INTEGER NOT NULL DEFAULT 0,
  hours_with_proof INTEGER NOT NULL DEFAULT 0,
  late_entries INTEGER NOT NULL DEFAULT 0,
  has_closeout BOOLEAN NOT NULL DEFAULT false,
  suspicious_reactions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id, date)
);

ALTER TABLE trust_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org trust scores"
  ON trust_score_history FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "System can insert trust scores"
  ON trust_score_history FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update trust scores"
  ON trust_score_history FOR UPDATE
  USING (true);

CREATE INDEX idx_trust_score_user_date ON trust_score_history(user_id, org_id, date);
