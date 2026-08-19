-- ============================================================
-- Shared Clinician Packet Storage (tokenized access)
-- ============================================================

CREATE TABLE IF NOT EXISTS shared_packets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_ref TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  token_hash TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  access_count INTEGER NOT NULL DEFAULT 0,
  max_accesses INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ
);

ALTER TABLE shared_packets ENABLE ROW LEVEL SECURITY;

-- No RLS policies by design.
-- Access is only through server-side API routes using service role key.

CREATE INDEX IF NOT EXISTS idx_shared_packets_token_hash ON shared_packets(token_hash);
CREATE INDEX IF NOT EXISTS idx_shared_packets_expires_at ON shared_packets(expires_at);
