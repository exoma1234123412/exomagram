-- ============================================
-- EXOMAGRAM - Database Schema
-- Transparencia total del trabajo por hora
-- ============================================

-- Enum: categorías de trabajo
CREATE TYPE work_category AS ENUM (
  'deep_work',
  'meeting',
  'review',
  'admin',
  'planning',
  'learning',
  'break',
  'blocked'
);

-- Enum: roles de organización
CREATE TYPE org_role AS ENUM ('owner', 'admin', 'member');

-- ============================================
-- TABLES
-- ============================================

-- Perfiles de usuario (se crea automáticamente al signup)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT,  -- e.g. "Frontend Developer", "Product Manager"
  timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Organizaciones / equipos
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Membresía: usuario <-> organización
CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- Entradas de tiempo (el corazón de la app)
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  category work_category NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  mood SMALLINT CHECK (mood >= 1 AND mood <= 5),
  energy SMALLINT CHECK (energy >= 1 AND energy <= 5),
  links TEXT[],
  auto_captured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id, date, hour)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_time_entries_user_date ON time_entries(user_id, date);
CREATE INDEX idx_time_entries_org_date ON time_entries(org_id, date);
CREATE INDEX idx_time_entries_date ON time_entries(date);
CREATE INDEX idx_org_members_user ON org_members(user_id);
CREATE INDEX idx_org_members_org ON org_members(org_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

-- Profiles: usuarios pueden ver perfiles de su misma org
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can view org member profiles"
  ON profiles FOR SELECT
  USING (
    id IN (
      SELECT om.user_id FROM org_members om
      WHERE om.org_id IN (
        SELECT org_id FROM org_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Organizations: miembros pueden ver su org
CREATE POLICY "Members can view their organizations"
  ON organizations FOR SELECT
  USING (
    id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Owners can update their organizations"
  ON organizations FOR UPDATE
  USING (
    id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Any authenticated user can create an organization"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Org members: miembros pueden ver otros miembros de su org
CREATE POLICY "Members can view org members"
  ON org_members FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can add members"
  ON org_members FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR
    -- Allow first member (creator) to add themselves
    NOT EXISTS (SELECT 1 FROM org_members WHERE org_id = org_members.org_id)
  );

-- Time entries: transparencia total dentro de la org
CREATE POLICY "Members can view all org time entries"
  ON time_entries FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own time entries"
  ON time_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own time entries"
  ON time_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own time entries"
  ON time_entries FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_time_entries_updated_at
  BEFORE UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- REALTIME
-- ============================================

-- Habilitar realtime en time_entries para actualizaciones en vivo
ALTER PUBLICATION supabase_realtime ADD TABLE time_entries;
