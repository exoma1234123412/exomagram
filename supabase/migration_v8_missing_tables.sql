-- ============================================================
-- Migration v8: Missing tables (accountability_buddies, title_tiers)
-- These are referenced in code but have no CREATE TABLE yet.
-- ============================================================

-- ============================================================
-- ACCOUNTABILITY BUDDIES
-- Pairs users with accountability partners within an org.
-- Used in celebrations.tsx for buddy-related celebrations.
-- ============================================================
CREATE TABLE IF NOT EXISTS accountability_buddies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  buddy_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id, buddy_user_id)
);

CREATE INDEX IF NOT EXISTS idx_accountability_buddies_org ON accountability_buddies(org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_accountability_buddies_pair ON accountability_buddies(user_id, buddy_user_id);

ALTER TABLE accountability_buddies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org accountability buddies"
  ON accountability_buddies FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on accountability_buddies"
  ON accountability_buddies FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- TITLE TIERS
-- Gamification tier grades (S/A/B/C/D/F) per user per org.
-- Used in celebrations.tsx for tier-up celebrations.
-- ============================================================
CREATE TABLE IF NOT EXISTS title_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'C' CHECK (tier IN ('S', 'A', 'B', 'C', 'D', 'F')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_title_tiers_org ON title_tiers(org_id);

ALTER TABLE title_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org title tiers"
  ON title_tiers FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on title_tiers"
  ON title_tiers FOR ALL
  USING (auth.role() = 'service_role');

ALTER PUBLICATION supabase_realtime ADD TABLE title_tiers;
