-- GAITBRIDGE Database Schema Migration
-- Supabase (PostgreSQL)
-- Generated from DATA_MODEL.md + ADR decisions
-- Run this in the Supabase SQL Editor

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Core Tables
-- ============================================================

CREATE TABLE child_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name_or_alias TEXT NOT NULL,
  date_of_birth DATE,
  age_months INTEGER,
  ambulatory_status TEXT NOT NULL CHECK (ambulatory_status IN ('independent', 'assisted', 'non_ambulant', 'unknown')),
  diagnosis_status TEXT NOT NULL DEFAULT 'none' CHECK (diagnosis_status IN ('suspected', 'diagnosed', 'unknown', 'none')),
  orthotics_use BOOLEAN NOT NULL DEFAULT FALSE,
  orthotics_type TEXT,
  mobility_aid_use BOOLEAN NOT NULL DEFAULT FALSE,
  mobility_aid_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE intake_forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_profile_id UUID NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  assessment_id UUID,
  recent_therapy_changes TEXT,
  recent_surgery_changes TEXT,
  falls_frequency TEXT NOT NULL CHECK (falls_frequency IN ('never', 'rare', 'weekly', 'daily')),
  caregiver_concern_text TEXT NOT NULL,
  consent_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clinician_organization TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE routing_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_profile_id UUID NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  route TEXT NOT NULL CHECK (route IN ('route_a', 'route_b')),
  reason TEXT NOT NULL,
  input_age_months INTEGER,
  input_ambulatory_status TEXT NOT NULL,
  input_caregiver_indication BOOLEAN NOT NULL DEFAULT FALSE,
  policy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_profile_id UUID NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  intake_form_id UUID NOT NULL REFERENCES intake_forms(id),
  routing_decision_id UUID NOT NULL REFERENCES routing_decisions(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  route TEXT NOT NULL CHECK (route IN ('route_a', 'route_b')),
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- Video & Quality
-- ============================================================

CREATE TABLE quality_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  overall_result TEXT NOT NULL CHECK (overall_result IN ('pass', 'borderline', 'fail')),
  body_visibility REAL NOT NULL,
  single_person_confidence REAL NOT NULL,
  camera_angle TEXT NOT NULL CHECK (camera_angle IN ('side', 'frontal', 'oblique', 'unknown')),
  camera_motion REAL NOT NULL,
  occlusion_severity REAL NOT NULL,
  resolution_sufficient BOOLEAN NOT NULL,
  frame_usability_pct REAL NOT NULL,
  detected_gait_cycles INTEGER NOT NULL DEFAULT 0,
  failure_reasons JSONB NOT NULL DEFAULT '[]'::JSONB,
  retake_instructions TEXT,
  confidence_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Pose & Landmarks (stored as JSONB for flexibility)
-- ============================================================

CREATE TABLE landmark_sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_version TEXT NOT NULL,
  frame_count INTEGER NOT NULL,
  fps REAL NOT NULL,
  frames JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Gait Features & Concerns
-- ============================================================

CREATE TABLE gait_feature_sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  cadence_proxy JSONB NOT NULL,
  step_timing_symmetry JSONB NOT NULL,
  lr_asymmetry_score JSONB NOT NULL,
  stride_regularity JSONB NOT NULL,
  knee_flexion_concern JSONB NOT NULL,
  ankle_plantarflexion JSONB NOT NULL,
  crouch_proxy JSONB NOT NULL,
  trunk_stability JSONB NOT NULL,
  view_type TEXT NOT NULL CHECK (view_type IN ('side', 'frontal', 'both')),
  policy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE concern_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  asymmetry_level TEXT NOT NULL CHECK (asymmetry_level IN ('none', 'mild', 'moderate', 'significant')),
  toe_walking_level TEXT NOT NULL CHECK (toe_walking_level IN ('none', 'mild', 'moderate', 'significant')),
  crouch_level TEXT NOT NULL CHECK (crouch_level IN ('none', 'mild', 'moderate', 'significant')),
  trunk_instability_level TEXT NOT NULL CHECK (trunk_instability_level IN ('none', 'mild', 'moderate', 'significant')),
  progression_status TEXT NOT NULL DEFAULT 'insufficient' CHECK (progression_status IN ('improving', 'stable', 'worsening', 'insufficient')),
  quality_warning BOOLEAN NOT NULL DEFAULT FALSE,
  followup_priority TEXT NOT NULL CHECK (followup_priority IN ('routine', 'earlier_review', 'specialist')),
  confidence_downgraded BOOLEAN NOT NULL DEFAULT FALSE,
  downgrade_reasons JSONB NOT NULL DEFAULT '[]'::JSONB,
  policy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Reports
-- ============================================================

CREATE TABLE caregiver_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  observations_text TEXT NOT NULL,
  confidence_text TEXT NOT NULL,
  limitations_text TEXT NOT NULL,
  monitoring_guidance TEXT NOT NULL,
  professional_eval_guidance TEXT NOT NULL,
  clinician_questions JSONB NOT NULL DEFAULT '[]'::JSONB,
  disclaimer_text TEXT NOT NULL,
  report_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clinician_packets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  profile_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  intake_context JSONB NOT NULL DEFAULT '{}'::JSONB,
  quality_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  metrics_table JSONB NOT NULL DEFAULT '{}'::JSONB,
  concern_domains JSONB NOT NULL DEFAULT '{}'::JSONB,
  trend_data JSONB,
  key_frames JSONB,
  structured_notes TEXT,
  report_version INTEGER NOT NULL DEFAULT 1,
  pdf_storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Timeline
-- ============================================================

CREATE TABLE symptom_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_profile_id UUID NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  note_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note_text TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE intervention_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_profile_id UUID NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  intervention_date DATE NOT NULL,
  intervention_type TEXT NOT NULL CHECK (intervention_type IN ('therapy', 'surgery', 'injection', 'orthotics', 'other')),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clinician_annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  clinician_user_id UUID NOT NULL REFERENCES auth.users(id),
  annotation_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Sharing
-- ============================================================

CREATE TABLE share_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  access_count INTEGER NOT NULL DEFAULT 0,
  max_accesses INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AI Navigator
-- ============================================================

CREATE TABLE navigator_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_id UUID REFERENCES assessments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE navigator_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES navigator_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  policy_filtered BOOLEAN NOT NULL DEFAULT FALSE,
  filter_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Audit
-- ============================================================

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  entity_type TEXT,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  policy_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE policy_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_event_id UUID NOT NULL REFERENCES audit_events(id) ON DELETE CASCADE,
  violation_type TEXT NOT NULL,
  attempted_content TEXT NOT NULL,
  blocked_by TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Consent Records
-- ============================================================

CREATE TABLE consent_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_profile_id UUID REFERENCES child_profiles(id),
  consent_type TEXT NOT NULL CHECK (consent_type IN ('intake', 'video_retention', 'sharing')),
  granted BOOLEAN NOT NULL DEFAULT TRUE,
  consent_text TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE child_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE landmark_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE gait_feature_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE concern_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE caregiver_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinician_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE symptom_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE intervention_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinician_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE navigator_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE navigator_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

-- Users can only access their own children
CREATE POLICY "Users can manage own child profiles"
  ON child_profiles FOR ALL
  USING (auth.uid() = user_id);

-- Users can only access intake forms for their children
CREATE POLICY "Users can manage own intake forms"
  ON intake_forms FOR ALL
  USING (child_profile_id IN (
    SELECT id FROM child_profiles WHERE user_id = auth.uid()
  ));

-- Users can only access routing decisions for their children
CREATE POLICY "Users can manage own routing decisions"
  ON routing_decisions FOR ALL
  USING (child_profile_id IN (
    SELECT id FROM child_profiles WHERE user_id = auth.uid()
  ));

-- Users can only access assessments for their children
CREATE POLICY "Users can manage own assessments"
  ON assessments FOR ALL
  USING (child_profile_id IN (
    SELECT id FROM child_profiles WHERE user_id = auth.uid()
  ));

-- Consent records for own user
CREATE POLICY "Users can view own consent records"
  ON consent_records FOR ALL
  USING (auth.uid() = user_id);

-- Navigator threads for own user
CREATE POLICY "Users can manage own navigator threads"
  ON navigator_threads FOR ALL
  USING (auth.uid() = user_id);

-- Share links created by user
CREATE POLICY "Users can manage own share links"
  ON share_links FOR ALL
  USING (auth.uid() = created_by);

-- Audit events (read-only for users, insert for service role)
CREATE POLICY "Users can view own audit events"
  ON audit_events FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_child_profiles_user_id ON child_profiles(user_id);
CREATE INDEX idx_intake_forms_child_profile_id ON intake_forms(child_profile_id);
CREATE INDEX idx_routing_decisions_child_profile_id ON routing_decisions(child_profile_id);
CREATE INDEX idx_assessments_child_profile_id ON assessments(child_profile_id);
CREATE INDEX idx_assessments_status ON assessments(status);
CREATE INDEX idx_quality_reports_assessment_id ON quality_reports(assessment_id);
CREATE INDEX idx_concern_profiles_assessment_id ON concern_profiles(assessment_id);
CREATE INDEX idx_symptom_notes_child_profile_id ON symptom_notes(child_profile_id);
CREATE INDEX idx_audit_events_user_id ON audit_events(user_id);
CREATE INDEX idx_audit_events_event_type ON audit_events(event_type);
CREATE INDEX idx_share_links_token ON share_links(token);
