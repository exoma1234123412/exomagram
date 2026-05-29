-- ============================================================
-- V12 — Projects table
-- Replaces free-text project field with proper entity
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
  color TEXT DEFAULT 'blue',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_org_status ON projects(org_id, status);

-- RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view projects"
  ON projects FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "org members can insert projects"
  ON projects FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "org members can update projects"
  ON projects FOR UPDATE
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

-- Backfill: create project records from existing free-text project tags
INSERT INTO projects (org_id, name, slug, created_by)
SELECT DISTINCT
  te.org_id,
  te.project,
  lower(regexp_replace(te.project, '[^a-zA-Z0-9]+', '-', 'g')),
  (SELECT om.user_id FROM org_members om WHERE om.org_id = te.org_id LIMIT 1)
FROM time_entries te
WHERE te.project IS NOT NULL
  AND te.project != ''
ON CONFLICT (org_id, slug) DO NOTHING;

-- Add project_id FK to time_entries (nullable, will coexist with text field during migration)
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);

-- Backfill project_id from text field
UPDATE time_entries te
SET project_id = p.id
FROM projects p
WHERE te.project IS NOT NULL
  AND te.project != ''
  AND te.org_id = p.org_id
  AND p.slug = lower(regexp_replace(te.project, '[^a-zA-Z0-9]+', '-', 'g'));

CREATE INDEX IF NOT EXISTS idx_time_entries_project_id ON time_entries(project_id);
