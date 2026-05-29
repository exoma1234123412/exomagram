-- ============================================
-- V13 — Event Log (high-volume user action tracking)
-- ============================================
-- Separate from audit_log (which has a strict CHECK constraint).
-- event_log is optimized for high-volume batched writes with
-- minimal schema constraints.

CREATE TABLE IF NOT EXISTS event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;

-- Only admins/owners can read event_log (analytics data)
CREATE POLICY "Admins can view org event log" ON event_log FOR SELECT
  USING (org_id IN (
    SELECT org_id FROM org_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Anyone can insert (client-side logger)
CREATE POLICY "Authenticated users can insert events" ON event_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Indexes for analytics queries
CREATE INDEX idx_event_log_org_date ON event_log(org_id, created_at);
CREATE INDEX idx_event_log_user_date ON event_log(user_id, created_at);
CREATE INDEX idx_event_log_type ON event_log(event_type, created_at);
CREATE INDEX idx_event_log_org_type ON event_log(org_id, event_type, created_at);

-- Partition hint: for large installations, consider partitioning by month
COMMENT ON TABLE event_log IS 'High-volume user action tracking. Batched writes from client-side EventLogger.';
