-- ============================================================
-- Hackathon / Prototype Raw Result Storage
-- ============================================================

CREATE TABLE IF NOT EXISTS hackathon_results (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- We allow public read/write to this bridge table during the hackathon
-- so that unauthenticated Parent and Clinician portals can easily pass data
-- without blocking the demo workflow. In production, this would be highly 
-- restricted via RLS to only matched auth.users() and specific tokens.
ALTER TABLE hackathon_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all actions for public hackathon demo"
  ON hackathon_results
  FOR ALL
  USING (true)
  WITH CHECK (true);
