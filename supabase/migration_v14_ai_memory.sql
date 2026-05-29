-- ============================================
-- V14 — AI Memory (persistent client-side memory for AI context)
-- ============================================
-- Stores compressed session summaries and behavioral patterns
-- that the AI uses for context-aware responses and insights.

CREATE TABLE IF NOT EXISTS ai_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  summary TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_memory ENABLE ROW LEVEL SECURITY;

-- Users can read their own memories
CREATE POLICY "Users can read own ai_memory" ON ai_memory FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own memories
CREATE POLICY "Users can insert own ai_memory" ON ai_memory FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own memories
CREATE POLICY "Users can delete own ai_memory" ON ai_memory FOR DELETE
  USING (user_id = auth.uid());

-- Admins can read all org memories (for AI analytics)
CREATE POLICY "Admins can view org ai_memory" ON ai_memory FOR SELECT
  USING (org_id IN (
    SELECT org_id FROM org_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Indexes
CREATE INDEX idx_ai_memory_user_type ON ai_memory(user_id, memory_type, created_at DESC);
CREATE INDEX idx_ai_memory_org ON ai_memory(org_id, created_at DESC);
CREATE INDEX idx_ai_memory_expires ON ai_memory(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE ai_memory IS 'Persistent AI memory entries. Session summaries, behavioral patterns, and compressed activity data.';
