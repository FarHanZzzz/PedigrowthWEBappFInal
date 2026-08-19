// PEDI-GROWTH — Concern Thresholds Policy (Frontal-First)
// Maps gait features to concern domains with follow-up priority.
// MVP: only frontal-valid concern domains are active.

import type { ConcernLevel, FollowupPriority, ConcernProfile, GaitFeatureSet, QualityResult } from '@/lib/types';
import concernThresholdsData from './concern-thresholds.json';

const POLICY_VERSION = '0.5.0-validated';

// ── Frontal-valid thresholds ──────────────────────────────────
// Each threshold: value boundary for mild/moderate/significant.

export const CONCERN_THRESHOLDS = {
  // Frontal asymmetry (combined hip-height + shoulder tilt score, 0-1)
  asymmetry: concernThresholdsData.concernThresholds.asymmetry,

  // Stride regularity (coefficient of variation, 0+)
  irregularRhythm: concernThresholdsData.concernThresholds.irregularRhythm,

  // Lateral trunk sway (normalized SD, 0-1)
  lateralInstability: concernThresholdsData.concernThresholds.lateralInstability,

  // Path deviation (normalized residual score, 0-1)
  pathDeviation: concernThresholdsData.concernThresholds.pathDeviation,
};

// Step timing symmetry is an input to asymmetry concern but not its own domain.
// If stepTimingSymmetry < threshold, it contributes to composite asymmetry concern.
export const STEP_TIMING_CONCERN_THRESHOLD = concernThresholdsData.stepTimingConcernThreshold;

// Ordered concern levels for comparison in confidence gating
const CONCERN_ORDER: ConcernLevel[] = ['none', 'mild', 'moderate', 'significant'];

function classifyConcern(
  value: number,
  thresholds: { mild: number; moderate: number; significant: number },
  confidence: number = 1.0,
): ConcernLevel {
  // Raw classification from value
  let level: ConcernLevel;
  if (value >= thresholds.significant) level = 'significant';
  else if (value >= thresholds.moderate) level = 'moderate';
  else if (value >= thresholds.mild) level = 'mild';
  else level = 'none';

  // CONFIDENCE GATING: Don't report high concern from low-confidence data.
  // This prevents noisy metrics from generating misleading concern levels.
  //   - confidence < 0.25 → cap at 'none' (not enough data to flag anything)
  //   - confidence < 0.40 → cap at 'mild'
  //   - confidence < 0.55 → cap at 'moderate'
  //   - confidence >= 0.55 → allow 'significant'
  if (confidence < 0.25) return 'none';
  if (confidence < 0.40 && CONCERN_ORDER.indexOf(level) > CONCERN_ORDER.indexOf('none')) {
    return 'mild';
  }
  if (confidence < 0.55 && level === 'significant') {
    return 'moderate';
  }

  return level;
}

function countSignificant(levels: ConcernLevel[]): number {
  return levels.filter((l) => l === 'significant').length;
}

function hasAnyAtLevel(levels: ConcernLevel[], target: ConcernLevel): boolean {
  return levels.some((l) => l === target);
}

/**
 * Score frontal-valid concern domains from gait features.
 *
 * Rules:
 * - Map each frontal feature value to none/mild/moderate/significant
 * - Step timing asymmetry can escalate the asymmetry concern
 * - Determine follow-up priority based on concern distribution
 * - Apply confidence downgrade if quality is borderline
 * - Never escalate beyond "specialist assessment recommended"
 */
export function scoreConcerns(
  features: GaitFeatureSet,
  qualityResult: QualityResult,
  isBestEffort: boolean,
  progressionOverride?: 'improving' | 'stable' | 'worsening',
): Omit<ConcernProfile, 'id' | 'assessmentId' | 'createdAt'> {
  // ── Asymmetry concern: composite of frontalAsymmetry + step timing ──
  let asymmetryLevel = classifyConcern(
    features.frontalAsymmetry.value,
    CONCERN_THRESHOLDS.asymmetry,
    features.frontalAsymmetry.confidence,
  );

  // BIDIRECTIONAL step timing adjustment:
  // - If step timing is ALSO asymmetric → escalate (corroborating evidence)
  // - If step timing is VERY symmetric (>0.95) but visual asymmetry is flagged → de-escalate
  //   (suggests the visual signal may be camera artifact, not real gait asymmetry)
  if (features.stepTimingSymmetry.value > 0 &&
      features.stepTimingSymmetry.value < STEP_TIMING_CONCERN_THRESHOLD &&
      features.stepTimingSymmetry.confidence >= 0.4) {
    // Escalate: corroborating temporal asymmetry
    if (asymmetryLevel === 'none') asymmetryLevel = 'mild';
    else if (asymmetryLevel === 'mild') asymmetryLevel = 'moderate';
  } else if (
    features.stepTimingSymmetry.value > 0.95 &&
    features.stepTimingSymmetry.confidence >= 0.4 &&
    asymmetryLevel !== 'none'
  ) {
    // De-escalate: contradicting temporal evidence suggests visual signal may be noise
    if (asymmetryLevel === 'significant') asymmetryLevel = 'moderate';
    else if (asymmetryLevel === 'moderate') asymmetryLevel = 'mild';
  }

  // ── Other frontal concerns (with confidence gating) ──
  const irregularRhythmLevel = classifyConcern(
    features.strideRegularity.value,
    CONCERN_THRESHOLDS.irregularRhythm,
    features.strideRegularity.confidence,
  );
  const lateralInstabilityLevel = classifyConcern(
    features.lateralTrunkSway.value,
    CONCERN_THRESHOLDS.lateralInstability,
    features.lateralTrunkSway.confidence,
  );
  const pathDeviationLevel = classifyConcern(
    features.pathDeviation.value,
    CONCERN_THRESHOLDS.pathDeviation,
    features.pathDeviation.confidence,
  );

  const progressionStatus = progressionOverride ?? 'insufficient' as const;

  const qualityWarning = qualityResult === 'borderline' || isBestEffort;
  const confidenceDowngraded = qualityWarning;
  const downgradeReasons: string[] = [];
  if (isBestEffort) {
    downgradeReasons.push('Analysis performed in best-effort mode. Concern levels are preliminary.');
  } else if (qualityResult === 'borderline') {
    downgradeReasons.push('Video quality was borderline. Concern levels may be less reliable.');
  }

  const levels: ConcernLevel[] = [
    asymmetryLevel,
    irregularRhythmLevel,
    lateralInstabilityLevel,
    pathDeviationLevel,
  ];

  // Determine follow-up priority.
  // Quality warnings should reduce confidence language, not hide urgent concern signals.
  const significantCount = countSignificant(levels);
  const hasSignificant = hasAnyAtLevel(levels, 'significant');
  const hasModerate = hasAnyAtLevel(levels, 'moderate');

  let followupPriority: FollowupPriority;
  if (significantCount >= 2 || progressionStatus === 'worsening') {
    followupPriority = 'specialist';
  } else if (hasSignificant || hasModerate) {
    followupPriority = 'earlier_review';
  } else {
    followupPriority = 'routine';
  }

  if (qualityWarning && followupPriority !== 'routine') {
    downgradeReasons.push(
      'Follow-up urgency reflects concern severity, but confidence is reduced by recording quality.'
    );
  }

  return {
    asymmetryLevel,
    irregularRhythmLevel,
    lateralInstabilityLevel,
    pathDeviationLevel,
    progressionStatus,
    qualityWarning,
    followupPriority,
    confidenceDowngraded,
    downgradeReasons,
    policyVersion: POLICY_VERSION,
  };
}

export { POLICY_VERSION };
