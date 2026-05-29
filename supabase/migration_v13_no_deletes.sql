-- ============================================================
-- V13 — Block all deletes at DB level
-- Users should never delete data. Everything is permanent.
-- ============================================================

-- Block time entry deletion
CREATE POLICY "no one can delete time entries"
  ON time_entries FOR DELETE
  USING (false);

-- Block org member deletion
CREATE POLICY "no one can delete org members"
  ON org_members FOR DELETE
  USING (false);

-- Block project deletion
CREATE POLICY "no one can delete projects"
  ON projects FOR DELETE
  USING (false);

-- Block standup deletion
CREATE POLICY "no one can delete standups"
  ON standups FOR DELETE
  USING (false);

-- Block closeout deletion
CREATE POLICY "no one can delete closeouts"
  ON daily_closeouts FOR DELETE
  USING (false);

-- Block flag deletion
CREATE POLICY "no one can delete flags"
  ON accountability_flags FOR DELETE
  USING (false);

-- Block trust score history deletion
CREATE POLICY "no one can delete trust scores"
  ON trust_score_history FOR DELETE
  USING (false);

-- Block notification deletion (mark as read instead)
CREATE POLICY "no one can delete notifications"
  ON notifications FOR DELETE
  USING (false);

-- Block achievement deletion
CREATE POLICY "no one can delete achievements"
  ON achievements FOR DELETE
  USING (false);

-- Auto-create org_settings when org is created
CREATE OR REPLACE FUNCTION handle_new_org()
RETURNS trigger AS $$
BEGIN
  INSERT INTO org_settings (org_id)
  VALUES (NEW.id)
  ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_org_created ON organizations;
CREATE TRIGGER on_org_created
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_org();
