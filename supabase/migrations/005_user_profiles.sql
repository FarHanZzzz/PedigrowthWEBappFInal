-- Pedi-Growth authentication: roles, profile rows, owned walking checks
-- Paste this in the Supabase SQL Editor after 001–004.

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('parent', 'clinician', 'admin')),
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid()
$$;

DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id OR public.current_user_role() IN ('clinician', 'admin'));

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Clinicians can read profiles" ON user_profiles;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_role TEXT;
BEGIN
  new_role := COALESCE(NEW.raw_user_meta_data->>'role', 'parent');
  IF new_role NOT IN ('parent', 'clinician', 'admin') THEN
    new_role := 'parent';
  END IF;

  INSERT INTO public.user_profiles (id, role, display_name)
  VALUES (
    NEW.id,
    new_role,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
  )
  ON CONFLICT (id) DO UPDATE
    SET
      display_name = EXCLUDED.display_name,
      updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

ALTER TABLE hackathon_results
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hackathon_results_user_id ON hackathon_results(user_id);

DROP POLICY IF EXISTS "Enable all actions for public hackathon demo" ON hackathon_results;
DROP POLICY IF EXISTS "Users manage own hackathon results" ON hackathon_results;
DROP POLICY IF EXISTS "Role based hackathon results" ON hackathon_results;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user_profile() TO postgres, service_role;

CREATE POLICY "Role based hackathon results"
  ON hackathon_results
  FOR ALL
  USING (
    user_id = auth.uid()
    OR user_id IS NULL
    OR public.current_user_role() IN ('clinician', 'admin')
  )
  WITH CHECK (
    user_id = auth.uid()
    OR user_id IS NULL
    OR public.current_user_role() IN ('clinician', 'admin')
  );


