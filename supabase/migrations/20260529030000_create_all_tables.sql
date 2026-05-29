CREATE TABLE IF NOT EXISTS projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, name text NOT NULL, slug text NOT NULL, description text, status text NOT NULL DEFAULT 'active', created_by uuid NOT NULL, created_at timestamptz DEFAULT now());
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "projects_all" ON projects FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS power_rankings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, user_id uuid NOT NULL, week_start date NOT NULL, rank int NOT NULL, total int NOT NULL, score numeric DEFAULT 0, created_at timestamptz DEFAULT now(), UNIQUE(org_id, user_id, week_start));
ALTER TABLE power_rankings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "power_rankings_all" ON power_rankings FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS journal_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, org_id uuid NOT NULL, week_of date NOT NULL, content text NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "journal_entries_all" ON journal_entries FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS mirror_tiers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, org_id uuid NOT NULL, tier text NOT NULL DEFAULT 'C', score numeric DEFAULT 0, created_at timestamptz DEFAULT now());
ALTER TABLE mirror_tiers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "mirror_tiers_all" ON mirror_tiers FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS communication_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, user_id uuid NOT NULL, channel text NOT NULL, content text, metadata jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "communication_logs_all" ON communication_logs FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tribunal_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, date date NOT NULL, entry_id uuid NOT NULL, nominated_user_id uuid NOT NULL, reason text, status text NOT NULL DEFAULT 'voting', guilty_votes int DEFAULT 0, innocent_votes int DEFAULT 0, created_at timestamptz DEFAULT now(), UNIQUE(org_id, date));
ALTER TABLE tribunal_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "tribunal_sessions_all" ON tribunal_sessions FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tribunal_votes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES tribunal_sessions(id) ON DELETE CASCADE, user_id uuid NOT NULL, vote text NOT NULL, created_at timestamptz DEFAULT now(), UNIQUE(session_id, user_id));
ALTER TABLE tribunal_votes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "tribunal_votes_all" ON tribunal_votes FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS predictions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, created_by uuid NOT NULL, question text NOT NULL, type text NOT NULL DEFAULT 'yes_no', resolution_date date NOT NULL, status text NOT NULL DEFAULT 'open', actual_value text, created_at timestamptz DEFAULT now());
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "predictions_all" ON predictions FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS prediction_bets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), prediction_id uuid NOT NULL REFERENCES predictions(id) ON DELETE CASCADE, user_id uuid NOT NULL, bet text NOT NULL, confidence int DEFAULT 50, is_correct boolean, created_at timestamptz DEFAULT now(), UNIQUE(prediction_id, user_id));
ALTER TABLE prediction_bets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "prediction_bets_all" ON prediction_bets FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS focus_duels (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, challenger_id uuid NOT NULL, opponent_id uuid NOT NULL, date date NOT NULL, status text NOT NULL DEFAULT 'pending', challenger_hours numeric DEFAULT 0, opponent_hours numeric DEFAULT 0, winner_id uuid, loser_confession text, created_at timestamptz DEFAULT now());
ALTER TABLE focus_duels ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "focus_duels_all" ON focus_duels FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS meeting_ratings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_id uuid NOT NULL, user_id uuid NOT NULL, org_id uuid NOT NULL, rating int NOT NULL, would_skip boolean DEFAULT false, comment text, created_at timestamptz DEFAULT now(), UNIQUE(entry_id, user_id));
ALTER TABLE meeting_ratings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "meeting_ratings_all" ON meeting_ratings FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS panic_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, org_id uuid NOT NULL, reason text, status text NOT NULL DEFAULT 'active', rescued_by uuid, rescued_at timestamptz, resolved_at timestamptz, created_at timestamptz DEFAULT now());
ALTER TABLE panic_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "panic_events_all" ON panic_events FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS weekly_contracts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, org_id uuid NOT NULL, week_start date NOT NULL, commitments jsonb NOT NULL DEFAULT '[]', overall_grade text, ai_assessment text, status text NOT NULL DEFAULT 'active', created_at timestamptz DEFAULT now(), graded_at timestamptz, UNIQUE(user_id, org_id, week_start));
ALTER TABLE weekly_contracts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "weekly_contracts_all" ON weekly_contracts FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS roulette_pairings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, date date NOT NULL, user_a uuid NOT NULL, user_b uuid NOT NULL, triggered_at timestamptz, user_a_verified boolean DEFAULT false, user_b_verified boolean DEFAULT false, deadline timestamptz, created_at timestamptz DEFAULT now());
ALTER TABLE roulette_pairings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "roulette_pairings_all" ON roulette_pairings FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS event_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, user_id uuid, event_type text NOT NULL, data jsonb NOT NULL DEFAULT '{}', metadata jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "event_log_all" ON event_log FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_event_log_org ON event_log(org_id, created_at);

CREATE TABLE IF NOT EXISTS ai_memory (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, user_id uuid, memory_type text NOT NULL, content jsonb NOT NULL DEFAULT '{}', summary text, created_at timestamptz DEFAULT now());
ALTER TABLE ai_memory ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "ai_memory_all" ON ai_memory FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS bounties (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, created_by uuid NOT NULL, title text NOT NULL, description text, reward_xp int DEFAULT 0, status text NOT NULL DEFAULT 'open', claimed_by uuid, completed_at timestamptz, created_at timestamptz DEFAULT now());
ALTER TABLE bounties ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "bounties_all" ON bounties FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS xp_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, org_id uuid NOT NULL, amount int NOT NULL, reason text NOT NULL, source text, created_at timestamptz DEFAULT now());
ALTER TABLE xp_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "xp_events_all" ON xp_events FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS project_id uuid;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS quality_score int;
