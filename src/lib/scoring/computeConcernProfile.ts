// PEDI-GROWTH — Concern Profile Computation (Frontal-First + Graceful Degradation)
//
// GRACEFUL DEGRADATION PRINCIPLE:
// In best-effort mode, concerns are CAPPED at 'mild' and follow-up
// priority is capped at 'routine'. This prevents overconfident escalation
// from noisy, low-quality input while still providing useful partial results.

import type { GaitFeatureSet, ConcernLevel, AssessmentMode, FollowupPriority } from '@/lib/types';
import { scoreConcerns } from '@/lib/policy/concern-thresholds';
import type { VideoQualityAssessment } from '@/lib/quality/qualityTypes';
import {
  BEST_EFFORT_CONCERN_CAP,
  BEST_EFFORT_PRIORITY_CAP,
  isLimitedAssessment,
  generateContextNotes,
  getAssessmentModeLabel,
  VIEW_SUPPORT,
} from './scoringPolicy';

export interface ComputedConcernResult {
  asymmetry: ConcernLevel;
  irregularRhythm: ConcernLevel;
  lateralInstability: ConcernLevel;
  pathDeviation: ConcernLevel;
  overallLevel: ConcernLevel;
  followupPriority: string;
  qualityWarning: boolean;
  confidenceDowngraded: boolean;
  downgradeReasons: string[];
  isLimited: boolean;
  contextNotes: string[];
  suppressedDomains: string[];
  assessedDomains: string[];
  viewLabel: string;
  assessmentModeLabel: string;
  assessmentMode: AssessmentMode;
  policyVersion: string;
}

const CONCERN_ORDER: ConcernLevel[] = ['none', 'mild', 'moderate', 'significant'];

function capConcern(level: ConcernLevel, cap: ConcernLevel): ConcernLevel {
  const levelIdx = CONCERN_ORDER.indexOf(level);
  const capIdx = CONCERN_ORDER.indexOf(cap);
  return levelIdx <= capIdx ? level : cap;
}

/**
 * Compute the full concern profile from real features and quality data.
 *
 * Best-effort rules:
 * 1. Apply confidence multiplier from quality to all features
 * 2. Cap all concerns at BEST_EFFORT_CONCERN_CAP ('mild')
 * 3. Cap follow-up priority at BEST_EFFORT_PRIORITY_CAP ('routine')
 * 4. Suppress metrics not in quality.usableMetrics
 * 5. Add "preliminary" framing to all notes
 */
export function computeConcernProfile(
  features: GaitFeatureSet,
  quality: VideoQualityAssessment,
): ComputedConcernResult {
  const suppressedDomains: string[] = [];
  const assessedDomains: string[] = [];
  const viewPolicy = VIEW_SUPPORT[quality.cameraAngle];
  const mode = quality.assessmentMode;
  const isBestEffort = mode === 'best_effort';
  const confMultiplier = quality.confidenceMultiplier;

  // Score through the policy engine
  const profile = scoreConcerns(features, quality.result, isBestEffort);

  // Apply confidence suppression + best-effort capping
  let asymmetry = profile.asymmetryLevel;
  let irregularRhythm = profile.irregularRhythmLevel;
  let lateralInstability = profile.lateralInstabilityLevel;
  let pathDeviation = profile.pathDeviationLevel;

  // Also suppress if metric is in quality.suppressedMetrics
  const suppressed = new Set(quality.suppressedMetrics);

  // GRACEFUL DEGRADATION: Never reset concern to 'none' based on low confidence.
  // The concern level reflects what the data shows — confidence tells us how much
  // to trust it. Resetting to 'none' hides real patient pathology.
  if (suppressed.has('frontalAsymmetry')) {
    suppressedDomains.push('asymmetry');
    asymmetry = 'none';
  } else {
    assessedDomains.push('asymmetry');
  }

  if (suppressed.has('strideRegularity')) {
    suppressedDomains.push('irregularRhythm');
    irregularRhythm = 'none';
  } else {
    assessedDomains.push('irregularRhythm');
  }

  if (suppressed.has('lateralTrunkSway')) {
    suppressedDomains.push('lateralInstability');
    lateralInstability = 'none';
  } else {
    assessedDomains.push('lateralInstability');
  }

  if (suppressed.has('pathDeviation')) {
    suppressedDomains.push('pathDeviation');
    pathDeviation = 'none';
  } else {
    assessedDomains.push('pathDeviation');
  }

  // Best-effort cap policy.
  // - Very low confidence: cap at mild.
  // - Limited confidence: cap at moderate.
  // - Adequate confidence: allow full concern range.
  const isVeryLowConfidence = confMultiplier < 0.25;
  const concernCap: ConcernLevel =
    isVeryLowConfidence
      ? BEST_EFFORT_CONCERN_CAP
      : confMultiplier < 0.55
        ? 'moderate'
        : 'significant';

  if (isBestEffort) {
    asymmetry = capConcern(asymmetry, concernCap);
    irregularRhythm = capConcern(irregularRhythm, concernCap);
    lateralInstability = capConcern(lateralInstability, concernCap);
    pathDeviation = capConcern(pathDeviation, concernCap);
  }

  // Overall concern level
  const levels: ConcernLevel[] = [asymmetry, irregularRhythm, lateralInstability, pathDeviation];
  const overallLevel: ConcernLevel =
    levels.includes('significant') ? 'significant' :
    levels.includes('moderate') ? 'moderate' :
    levels.includes('mild') ? 'mild' :
    'none';

  // Follow-up priority capping in best-effort mode.
  // Keep urgent routing visible when signal confidence is adequate.
  let followupPriority: FollowupPriority = profile.followupPriority;
  if (isBestEffort) {
    if (isVeryLowConfidence) {
      followupPriority = BEST_EFFORT_PRIORITY_CAP;
    } else if (confMultiplier < 0.55 && followupPriority === 'specialist') {
      followupPriority = 'earlier_review';
    }
  }

  const bestEffortCapReason =
    isVeryLowConfidence
      ? 'Video quality required best-effort analysis. Concern severity is capped at mild with routine follow-up.'
      : confMultiplier < 0.55
        ? 'Video quality required best-effort analysis. Concern severity is capped at moderate while confidence is limited.'
        : 'Video quality required best-effort analysis. Consider confidence context alongside concern severity.';

  // Context notes
  const isLimited = isLimitedAssessment(quality.cameraAngle, quality.frameUsabilityPct, mode);
  const contextNotes = generateContextNotes(
    quality.cameraAngle,
    quality.frameUsabilityPct,
    quality.durationSeconds,
    mode,
  );

  if (suppressedDomains.length > 0) {
    contextNotes.push(
      `Could not reliably assess: ${suppressedDomains.join(', ')}. A higher quality recording may help.`
    );
  }

  if (isBestEffort && assessedDomains.length > 0) {
    contextNotes.push(
      `Assessed with reduced confidence: ${assessedDomains.join(', ')}.`
    );
  }

  return {
    asymmetry,
    irregularRhythm,
    lateralInstability,
    pathDeviation,
    overallLevel,
    followupPriority,
    qualityWarning: profile.qualityWarning || isBestEffort,
    confidenceDowngraded: profile.confidenceDowngraded || isBestEffort,
    downgradeReasons: isBestEffort
      ? [...profile.downgradeReasons, bestEffortCapReason]
      : profile.downgradeReasons,
    isLimited,
    contextNotes,
    suppressedDomains,
    assessedDomains,
    viewLabel: viewPolicy.label,
    assessmentModeLabel: getAssessmentModeLabel(mode),
    assessmentMode: mode,
    policyVersion: profile.policyVersion,
  };
}
