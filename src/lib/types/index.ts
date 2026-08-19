// PEDI-GROWTH — Domain Types
// Central type definitions for the entire application.
// All modules import from here. No ad-hoc types elsewhere.

// ============================================================
// Enums
// ============================================================

export type AmbulatoryStatus = 'independent' | 'assisted' | 'non_ambulant' | 'unknown';
export type DiagnosisStatus = 'suspected' | 'diagnosed' | 'unknown' | 'none';
export type FallsFrequency = 'never' | 'rare' | 'weekly' | 'daily';
export type Route = 'route_a' | 'route_b';
export type AssessmentStatus = 'pending' | 'processing' | 'complete' | 'failed';
export type AssessmentMode = 'full_assessment' | 'best_effort' | 'cannot_assess';
/** @deprecated — use AssessmentMode instead */
export type QualityResult = 'pass' | 'borderline' | 'fail';
export type CameraAngle = 'side' | 'frontal' | 'oblique' | 'unknown';
export type ViewType = 'side' | 'frontal' | 'both';
export type ConcernLevel = 'none' | 'mild' | 'moderate' | 'significant';
export type ProgressionStatus = 'improving' | 'stable' | 'worsening' | 'insufficient';
export type FollowupPriority = 'routine' | 'earlier_review' | 'specialist';
export type UserRole = 'caregiver' | 'clinician' | 'admin';
export type ConsentType = 'intake' | 'video_retention' | 'sharing';
export type InterventionType = 'therapy' | 'surgery' | 'injection' | 'orthotics' | 'other';
export type MessageRole = 'user' | 'assistant' | 'system';
export type AuditSeverity = 'info' | 'warning' | 'critical';

// ============================================================
// Core Entities
// ============================================================

export interface ChildProfile {
  id: string;
  userId: string;
  nameOrAlias: string;
  dateOfBirth: string | null; // ISO date
  ageMonths: number | null;
  ambulatoryStatus: AmbulatoryStatus;
  diagnosisStatus: DiagnosisStatus;
  orthoticsUse: boolean;
  orthoticsType: string | null;
  mobilityAidUse: boolean;
  mobilityAidType: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface IntakeForm {
  id: string;
  childProfileId: string;
  assessmentId: string | null;
  recentTherapyChanges: string | null;
  recentSurgeryChanges: string | null;
  fallsFrequency: FallsFrequency;
  caregiverConcernText: string;
  consentAcknowledged: boolean;
  consentTimestamp: string;
  clinicianOrganization: string | null;
  createdAt: string;
}

export interface RoutingDecision {
  id: string;
  childProfileId: string;
  route: Route;
  reason: string;
  inputAgeMonths: number | null;
  inputAmbulatoryStatus: AmbulatoryStatus;
  inputCaregiverIndication: boolean;
  policyVersion: string;
  createdAt: string;
}

export interface Assessment {
  id: string;
  childProfileId: string;
  intakeFormId: string;
  routingDecisionId: string;
  status: AssessmentStatus;
  route: Route;
  sessionDate: string;
  createdAt: string;
  completedAt: string | null;
}

// ============================================================
// Video & Quality
// ============================================================

export interface VideoMeta {
  mimeType: string;
  durationSeconds: number;
  resolution: string;
  fileSizeBytes: number;
}

export interface QualityReport {
  id: string;
  assessmentId: string;
  overallResult: QualityResult;
  bodyVisibility: number;
  singlePersonConfidence: number;
  cameraAngle: CameraAngle;
  cameraMotion: number;
  occlusionSeverity: number;
  resolutionSufficient: boolean;
  frameUsabilityPct: number;
  detectedGaitCycles: number;
  failureReasons: string[];
  retakeInstructions: string | null;
  confidenceNotes: string;
  createdAt: string;
}

// ============================================================
// Pose & Landmarks
// ============================================================

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
  name: string;
}

export interface LandmarkFrame {
  timestampMs: number;
  landmarks: Landmark[];
}

export interface LandmarkSequence {
  id: string;
  assessmentId: string;
  provider: string;
  providerVersion: string;
  frameCount: number;
  fps: number;
  frames: LandmarkFrame[];
  createdAt: string;
}

// ============================================================
// Pose Provider Abstraction
// ============================================================

export interface PoseProvider {
  readonly name: string;
  readonly version: string;
  initialize(): Promise<void>;
  extractFrame(frame: ImageBitmap | HTMLVideoElement, timestampMs?: number): Promise<LandmarkFrame>;
  dispose(): void;
}

// ============================================================
// Gait Features
// ============================================================

export interface MetricValue {
  value: number;
  confidence: number;
  unit?: string;
  limitedReason?: string;
}

export interface GaitFeatureSet {
  // ── Frontal-valid metrics (MVP primary) ──────────────────────
  cadenceProxy: MetricValue;
  stepTimingSymmetry: MetricValue;
  frontalAsymmetry: MetricValue;
  strideRegularity: MetricValue;
  lateralTrunkSway: MetricValue;
  pathDeviation: MetricValue;
  baseOfSupport: MetricValue;

  // ── Sagittal metrics (side-view only, suppressed in MVP) ────
  _sagittal_kneeFlexion?: MetricValue;
  _sagittal_anklePlantarflexion?: MetricValue;
  _sagittal_crouchProxy?: MetricValue;
  _sagittal_anteriorTrunkLean?: MetricValue;

  viewType: ViewType;
  policyVersion: string;
}

export interface ProgressionDelta {
  metricName: string;
  previousValue: number;
  currentValue: number;
  direction: 'improved' | 'worsened' | 'unchanged';
  confidence: number;
}

// ============================================================
// Concern Engine
// ============================================================

export interface ConcernProfile {
  id: string;
  assessmentId: string;
  // ── Frontal-valid concern domains ───────────────────────────
  asymmetryLevel: ConcernLevel;
  irregularRhythmLevel: ConcernLevel;
  lateralInstabilityLevel: ConcernLevel;
  pathDeviationLevel: ConcernLevel;
  // ── Sagittal concern domains (suppressed in MVP) ───────────
  _sagittal_toeWalkingLevel?: ConcernLevel;
  _sagittal_crouchLevel?: ConcernLevel;
  progressionStatus: ProgressionStatus;
  qualityWarning: boolean;
  followupPriority: FollowupPriority;
  confidenceDowngraded: boolean;
  downgradeReasons: string[];
  policyVersion: string;
  createdAt: string;
}

// ============================================================
// Reports
// ============================================================

export interface CaregiverReport {
  id: string;
  assessmentId: string;
  observationsText: string;
  contextSignalText?: string | null;
  confidenceText: string;
  limitationsText: string;
  monitoringGuidance: string;
  professionalEvalGuidance: string;
  clinicianQuestions: string[];
  disclaimerText: string;
  reportVersion: number;
  createdAt: string;
}

export interface ClinicianPacket {
  id: string;
  assessmentId: string;
  profileSummary: Record<string, unknown>;
  intakeContext: Record<string, unknown>;
  qualitySummary: Record<string, unknown>;
  metricsTable: Record<string, unknown>;
  concernDomains: Record<string, unknown>;
  trendData: Record<string, unknown> | null;
  keyFrames: string[] | null;
  structuredNotes: string | null;
  reportVersion: number;
  pdfStoragePath: string | null;
  createdAt: string;
}

// ============================================================
// Timeline & Notes
// ============================================================

export interface SymptomNote {
  id: string;
  childProfileId: string;
  noteDate: string;
  noteText: string;
  category: string | null;
  createdAt: string;
}

export interface InterventionLog {
  id: string;
  childProfileId: string;
  interventionDate: string;
  interventionType: InterventionType;
  description: string;
  createdAt: string;
}

export interface ClinicianAnnotation {
  id: string;
  assessmentId: string;
  clinicianUserId: string;
  annotationText: string;
  createdAt: string;
}

// ============================================================
// Sharing
// ============================================================

export interface ShareLink {
  id: string;
  assessmentId: string;
  createdBy: string;
  token: string;
  expiresAt: string;
  accessCount: number;
  maxAccesses: number | null;
  isActive: boolean;
  createdAt: string;
}

// ============================================================
// AI Navigator
// ============================================================

export interface NavigatorThread {
  id: string;
  userId: string;
  assessmentId: string | null;
  createdAt: string;
}

export interface NavigatorMessage {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  toolCalls: Record<string, unknown>[] | null;
  policyFiltered: boolean;
  filterReason: string | null;
  createdAt: string;
}

// ============================================================
// Audit & Policy
// ============================================================

export interface AuditEvent {
  id: string;
  userId: string | null;
  eventType: string;
  severity: AuditSeverity;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown>;
  policyVersion: string | null;
  createdAt: string;
}

export interface PolicyViolation {
  id: string;
  auditEventId: string;
  violationType: string;
  attemptedContent: string;
  blockedBy: string;
  resolved: boolean;
  createdAt: string;
}

// ============================================================
// Routing Policy Inputs/Outputs
// ============================================================

export interface RoutingInput {
  ageMonths: number | null;
  ambulatoryStatus: AmbulatoryStatus;
  caregiverIndicatesCannotWalk: boolean;
}

export interface LanguageSafetyResult {
  safe: boolean;
  violations: string[];
  sanitizedText: string | null;
}

export interface ProhibitedClaimsResult {
  passed: boolean;
  blockedClaims: string[];
  cleanText: string;
}
