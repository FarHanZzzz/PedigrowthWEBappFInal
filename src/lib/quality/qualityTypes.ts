// PEDI-GROWTH — Quality Assessment Types
// Graceful degradation: full_assessment / best_effort / cannot_assess

import type { QualityResult, CameraAngle, AssessmentMode } from '@/lib/types';

export interface VideoQualityInput {
  videoBlob: Blob;
  videoType: string;
}

export interface FrameQualitySample {
  frameIndex: number;
  timestampMs: number;
  landmarksDetected: boolean;
  landmarkCount: number;
  bodyVisibility: number;
  hipCenter: { x: number; y: number } | null;
}

export interface VideoQualityAssessment {
  // ── New: assessment mode (replaces binary pass/fail for flow control) ──
  assessmentMode: AssessmentMode;
  /** Which metrics have enough signal to compute */
  usableMetrics: string[];
  /** Which metrics should be suppressed due to quality */
  suppressedMetrics: string[];
  /** Confidence multiplier (1.0 = full, 0.5 = best-effort, 0 = cannot) */
  confidenceMultiplier: number;

  // ── Legacy: kept for backward compat but NOT used for flow control ──
  result: QualityResult;

  // ── Raw quality signals ──
  bodyVisibility: number;
  singlePersonConfidence: number;
  cameraAngle: CameraAngle;
  cameraMotion: number;
  occlusionSeverity: number;
  frameUsabilityPct: number;
  detectedGaitCycles: number;
  resolutionWidth: number;
  resolutionHeight: number;
  durationSeconds: number;

  // ── Human-facing ──
  failureReasons: string[];
  borderlineReasons: string[];
  retakeInstructions: string | null;
  retakeSuggestions: string[];
  confidenceNotes: string;
  frameSamples: FrameQualitySample[];
}
