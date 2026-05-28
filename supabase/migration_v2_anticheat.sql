-- ============================================
-- EXOMAGRAM V2 - Anti-Gaming & Extreme Transparency
-- No hay forma de engañar al sistema
-- ============================================

-- ============================================
-- NUEVAS COLUMNAS EN TIME_ENTRIES
-- ============================================

-- Estado de verificación
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified'
  CHECK (verification_status IN ('unverified', 'verified', 'flagged', 'disputed'));

-- Prueba de trabajo (URL a screenshot, commit, PR, etc.)
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS proof_urls TEXT[];

-- Si la entrada fue registrada tarde (después de la hora)
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT false;

-- Cuántos minutos tarde se registró
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS minutes_late INTEGER DEFAULT 0;

-- Timestamp exacto del registro (para detectar backfilling)
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS logged_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Nota de verificación (cuando un admin verifica/disputa)
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS verification_note TEXT;

-- Quién verificó
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES profiles(id);

-- ============================================
-- LIVE STATUS - ¿Qué está haciendo AHORA?
-- ============================================

CREATE TABLE IF NOT EXISTS live_status (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'offline'
    CHECK (status IN ('online', 'idle', 'in_meeting', 'deep_work', 'break', 'offline')),
  current_task TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE live_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org live status"
  ON live_status FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own live status"
  ON live_status FOR ALL
  USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE live_status;

-- ============================================
-- DAILY CLOSEOUTS - Resumen obligatorio del día
-- ============================================

CREATE TABLE IF NOT EXISTS daily_closeouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  summary TEXT NOT NULL,
  blockers TEXT,
  tomorrow_plan TEXT,
  mood SMALLINT CHECK (mood >= 1 AND mood <= 5),
  hours_logged INTEGER NOT NULL DEFAULT 0,
  hours_with_proof INTEGER NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id, date)
);

ALTER TABLE daily_closeouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org closeouts"
  ON daily_closeouts FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own closeouts"
  ON daily_closeouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own closeouts"
  ON daily_closeouts FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- ENTRY REACTIONS - Verificación por pares
-- ============================================

CREATE TABLE IF NOT EXISTS entry_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('verified', 'suspicious', 'impressive', 'helped_me')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entry_id, user_id)
);

ALTER TABLE entry_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view reactions in their org"
  ON entry_reactions FOR SELECT
  USING (
    entry_id IN (
      SELECT id FROM time_entries WHERE org_id IN (
        SELECT org_id FROM org_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Authenticated users can react"
  ON entry_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reactions"
  ON entry_reactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reactions"
  ON entry_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- ACTIVITY STREAKS
-- ============================================

CREATE TABLE IF NOT EXISTS activity_streaks (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE,
  total_days_logged INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE activity_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org streaks"
  ON activity_streaks FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own streaks"
  ON activity_streaks FOR ALL
  USING (user_id = auth.uid());

-- ============================================
-- ACCOUNTABILITY FLAGS - Banderas automáticas
-- ============================================

CREATE TABLE IF NOT EXISTS accountability_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL CHECK (flag_type IN (
    'missing_hours',      -- No registró horas en día laboral
    'no_proof',           -- Muchas horas sin evidencia
    'late_entries',       -- Registra todo al final del día
    'no_closeout',        -- No hizo closeout del día
    'low_detail',         -- Entradas muy vagas
    'suspicious_pattern', -- Patrón sospechoso detectado
    'idle_long'           -- Mucho tiempo idle
  )),
  date DATE NOT NULL,
  details TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES profiles(id),
  resolved_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE accountability_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org flags"
  ON accountability_flags FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "System can create flags"
  ON accountability_flags FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update flags"
  ON accountability_flags FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ============================================
-- REALTIME
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE daily_closeouts;
ALTER PUBLICATION supabase_realtime ADD TABLE entry_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE accountability_flags;
