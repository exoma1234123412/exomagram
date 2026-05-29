-- Migration v7: Creative Features
-- Tribunal Diario, Prediction Market, Focus Duels, Meeting Autopsy,
-- Panic Button, Work Contract, Accountability Roulette

-- ============================================================
-- TRIBUNAL DIARIO (Daily Court)
-- ============================================================
CREATE TABLE IF NOT EXISTS tribunal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  date date NOT NULL,
  entry_id uuid NOT NULL,
  nominated_user_id uuid NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'voting' CHECK (status IN ('voting', 'guilty', 'innocent', 'expired')),
  guilty_votes int DEFAULT 0,
  innocent_votes int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, date)
);

CREATE TABLE IF NOT EXISTS tribunal_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES tribunal_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  vote text NOT NULL CHECK (vote IN ('guilty', 'innocent')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(session_id, user_id)
);

-- ============================================================
-- PREDICTION MARKET
-- ============================================================
CREATE TABLE IF NOT EXISTS predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  created_by uuid NOT NULL,
  question text NOT NULL,
  type text NOT NULL DEFAULT 'yes_no' CHECK (type IN ('yes_no', 'numeric', 'person')),
  resolution_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved_yes', 'resolved_no', 'cancelled')),
  actual_value text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prediction_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id uuid NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  bet text NOT NULL,
  confidence int DEFAULT 50 CHECK (confidence >= 1 AND confidence <= 100),
  is_correct boolean,
  created_at timestamptz DEFAULT now(),
  UNIQUE(prediction_id, user_id)
);

-- ============================================================
-- FOCUS DUELS
-- ============================================================
CREATE TABLE IF NOT EXISTS focus_duels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  challenger_id uuid NOT NULL,
  opponent_id uuid NOT NULL,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'declined')),
  challenger_hours numeric DEFAULT 0,
  opponent_hours numeric DEFAULT 0,
  winner_id uuid,
  loser_confession text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- MEETING AUTOPSY (Meeting ROI Ratings)
-- ============================================================
CREATE TABLE IF NOT EXISTS meeting_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL,
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  would_skip boolean DEFAULT false,
  comment text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(entry_id, user_id)
);

-- ============================================================
-- PANIC BUTTON
-- ============================================================
CREATE TABLE IF NOT EXISTS panic_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rescued', 'resolved')),
  rescued_by uuid,
  rescued_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- WORK CONTRACT (Pacto Semanal)
-- ============================================================
CREATE TABLE IF NOT EXISTS weekly_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  week_start date NOT NULL,
  commitments jsonb NOT NULL DEFAULT '[]',
  overall_grade text,
  ai_assessment text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'graded')),
  created_at timestamptz DEFAULT now(),
  graded_at timestamptz,
  UNIQUE(user_id, org_id, week_start)
);

-- ============================================================
-- ACCOUNTABILITY ROULETTE
-- ============================================================
CREATE TABLE IF NOT EXISTS roulette_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  date date NOT NULL,
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  triggered_at timestamptz,
  user_a_verified boolean DEFAULT false,
  user_b_verified boolean DEFAULT false,
  deadline timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- RLS Policies (basic org isolation)
-- ============================================================
ALTER TABLE tribunal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tribunal_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_duels ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE panic_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE roulette_pairings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (org filtering done in app)
CREATE POLICY "tribunal_sessions_all" ON tribunal_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tribunal_votes_all" ON tribunal_votes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "predictions_all" ON predictions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "prediction_bets_all" ON prediction_bets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "focus_duels_all" ON focus_duels FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "meeting_ratings_all" ON meeting_ratings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "panic_events_all" ON panic_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "weekly_contracts_all" ON weekly_contracts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "roulette_pairings_all" ON roulette_pairings FOR ALL USING (true) WITH CHECK (true);
