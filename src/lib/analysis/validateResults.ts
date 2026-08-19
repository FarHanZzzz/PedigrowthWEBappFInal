// PEDI-GROWTH — Post-Computation Result Validation
//
// This module validates computed gait metrics against physiological bounds
// and clinical plausibility rules BEFORE they reach the scoring layer.
//
// PURPOSE: Catch measurement errors, implausible values, and cross-metric
// inconsistencies that would make the concern profile misleading.
//
// DESIGN PRINCIPLE: Never silently hide data. If a metric fails validation,
// mark it with a warning and reduce its confidence — don't suppress it.

import type { GaitFeatureSet, MetricValue } from '@/lib/types';
import normativeRefs from '@/lib/policy/normative-references.json';

export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  adjustedFeatures: GaitFeatureSet;
  validationMetadata: Record<string, MetricValidation>;
}

export interface MetricValidation {
  originalValue: number;
  originalConfidence: number;
  adjustedValue: number;
  adjustedConfidence: number;
  status: 'pass' | 'clamped' | 'implausible' | 'insufficient_evidence';
  reason?: string;
}

// ── Physiological Bounds ──────────────────────────────────────────

const CADENCE_BOUNDS = normativeRefs.cadence.physiologicalBounds;
const MIN_STRIKES_FOR_CADENCE = normativeRefs.minimumEvidenceRequirements.minStrikesForCadence;
const MIN_INTERVALS_FOR_REGULARITY = normativeRefs.minimumEvidenceRequirements.minIntervalsForRegularity;

const CONFIDENCE_CEILING = normativeRefs.minimumEvidenceRequirements.confidenceCeilingForShortClips;

/**
 * Validate computed gait features against physiological bounds
 * and plausibility rules.
 *
 * Returns adjusted features with warnings and validation metadata.
 * The adjusted features should be used downstream instead of raw ones.
 */
export function validateGaitResults(
  features: GaitFeatureSet,
  durationSeconds: number,
  totalFrames: number,
  detectedStrikes: number,
): ValidationResult {
  const warnings: string[] = [];
  const metadata: Record<string, MetricValidation> = {};
  const adjusted = { ...features };

  // ── Duration-based confidence ceiling ──────────────────────────
  const durationCeiling = getDurationConfidenceCeiling(durationSeconds);

  // ── Cadence validation ─────────────────────────────────────────
  metadata.cadence = validateMetric(
    adjusted.cadenceProxy,
    'cadence',
    {
      min: CADENCE_BOUNDS.min,
      max: CADENCE_BOUNDS.max,
      minEvidence: MIN_STRIKES_FOR_CADENCE,
      evidenceCount: detectedStrikes,
    },
    durationCeiling,
    warnings,
  );
  adjusted.cadenceProxy = applyValidation(adjusted.cadenceProxy, metadata.cadence);

  // ── Step timing symmetry validation ────────────────────────────
  metadata.stepTimingSymmetry = validateMetric(
    adjusted.stepTimingSymmetry,
    'stepTimingSymmetry',
    {
      min: 0,
      max: 1.0,
      minEvidence: MIN_INTERVALS_FOR_REGULARITY,
      evidenceCount: Math.max(0, detectedStrikes - 1),
    },
    durationCeiling,
    warnings,
  );
  adjusted.stepTimingSymmetry = applyValidation(adjusted.stepTimingSymmetry, metadata.stepTimingSymmetry);

  // ── Frontal asymmetry validation ───────────────────────────────
  metadata.frontalAsymmetry = validateMetric(
    adjusted.frontalAsymmetry,
    'frontalAsymmetry',
    {
      min: 0,
      max: 1.0,
      minEvidence: normativeRefs.minimumEvidenceRequirements.minFramesForMetric,
      evidenceCount: totalFrames,
    },
    durationCeiling,
    warnings,
  );
  adjusted.frontalAsymmetry = applyValidation(adjusted.frontalAsymmetry, metadata.frontalAsymmetry);

  // ── Stride regularity validation ───────────────────────────────
  metadata.strideRegularity = validateMetric(
    adjusted.strideRegularity,
    'strideRegularity',
    {
      min: 0,
      max: 1.0,
      minEvidence: MIN_INTERVALS_FOR_REGULARITY,
      evidenceCount: Math.max(0, detectedStrikes - 1),
    },
    durationCeiling,
    warnings,
  );
  adjusted.strideRegularity = applyValidation(adjusted.strideRegularity, metadata.strideRegularity);

  // ── Lateral trunk sway validation ──────────────────────────────
  metadata.lateralTrunkSway = validateMetric(
    adjusted.lateralTrunkSway,
    'lateralTrunkSway',
    {
      min: 0,
      max: 1.0,
      minEvidence: normativeRefs.minimumEvidenceRequirements.minFramesForMetric,
      evidenceCount: totalFrames,
    },
    durationCeiling,
    warnings,
  );
  adjusted.lateralTrunkSway = applyValidation(adjusted.lateralTrunkSway, metadata.lateralTrunkSway);

  // ── Path deviation validation ──────────────────────────────────
  metadata.pathDeviation = validateMetric(
    adjusted.pathDeviation,
    'pathDeviation',
    {
      min: 0,
      max: 1.0,
      minEvidence: normativeRefs.minimumEvidenceRequirements.minFramesForMetric,
      evidenceCount: totalFrames,
    },
    durationCeiling,
    warnings,
  );
  adjusted.pathDeviation = applyValidation(adjusted.pathDeviation, metadata.pathDeviation);

  // ── Base of support validation ─────────────────────────────────
  metadata.baseOfSupport = validateMetric(
    adjusted.baseOfSupport,
    'baseOfSupport',
    {
      min: 0,
      max: 0.5, // More than half the screen width would be unreasonable
      minEvidence: normativeRefs.minimumEvidenceRequirements.minFramesForMetric,
      evidenceCount: totalFrames,
    },
    durationCeiling,
    warnings,
  );
  adjusted.baseOfSupport = applyValidation(adjusted.baseOfSupport, metadata.baseOfSupport);

  // ── Cross-metric consistency checks ────────────────────────────
  const crossWarnings = checkCrossMetricConsistency(adjusted);
  warnings.push(...crossWarnings);

  return {
    isValid: warnings.length === 0,
    warnings,
    adjustedFeatures: adjusted,
    validationMetadata: metadata,
  };
}

// ── Internal helpers ─────────────────────────────────────────────

interface MetricBounds {
  min: number;
  max: number;
  minEvidence: number;
  evidenceCount: number;
}

function validateMetric(
  metric: MetricValue,
  name: string,
  bounds: MetricBounds,
  durationCeiling: number,
  warnings: string[],
): MetricValidation {
  const result: MetricValidation = {
    originalValue: metric.value,
    originalConfidence: metric.confidence,
    adjustedValue: metric.value,
    adjustedConfidence: metric.confidence,
    status: 'pass',
  };

  // Check evidence sufficiency
  if (bounds.evidenceCount < bounds.minEvidence) {
    result.status = 'insufficient_evidence';
    result.adjustedConfidence = Math.min(result.adjustedConfidence, 0.2);
    result.reason = `${name}: only ${bounds.evidenceCount} observations (need ${bounds.minEvidence})`;
    warnings.push(result.reason);
    return result;
  }

  // Check physiological bounds
  if (metric.value < bounds.min || metric.value > bounds.max) {
    result.status = 'clamped';
    result.adjustedValue = clamp(metric.value, bounds.min, bounds.max);
    result.adjustedConfidence = Math.min(result.adjustedConfidence * 0.5, 0.3);
    result.reason = `${name}: value ${metric.value.toFixed(3)} outside physiological range [${bounds.min}, ${bounds.max}]`;
    warnings.push(result.reason);
    return result;
  }

  // Apply duration-based confidence ceiling
  result.adjustedConfidence = Math.min(result.adjustedConfidence, durationCeiling);

  return result;
}

function applyValidation(metric: MetricValue, validation: MetricValidation): MetricValue {
  return {
    ...metric,
    value: validation.adjustedValue,
    confidence: validation.adjustedConfidence,
    limitedReason: validation.reason ?? metric.limitedReason,
  };
}

function getDurationConfidenceCeiling(durationSeconds: number): number {
  if (durationSeconds < 3) return CONFIDENCE_CEILING.under3sec;
  if (durationSeconds < 5) return CONFIDENCE_CEILING.under5sec;
  return CONFIDENCE_CEILING.over5sec;
}

/**
 * Cross-metric consistency checks.
 *
 * These catch contradictions that suggest measurement error:
 * - Normal cadence + significant rhythm irregularity → suspect
 * - Normal symmetry + significant asymmetry → suspect
 */
function checkCrossMetricConsistency(features: GaitFeatureSet): string[] {
  const warnings: string[] = [];

  // If cadence is normal-range but stride regularity shows significant irregularity,
  // it's suspicious — both derive from the same step detection.
  const cadence = features.cadenceProxy.value;
  const regularity = features.strideRegularity.value;
  if (cadence > 80 && cadence < 180 && regularity > 0.3 && features.strideRegularity.confidence > 0.5) {
    warnings.push(
      'Cross-check: cadence is normal but stride regularity is very high. Step detection may be unreliable.'
    );
  }

  // If step timing is highly symmetric but frontal asymmetry is flagged as significant,
  // the visual asymmetry may be camera-angle artifact, not real gait asymmetry.
  const stepSym = features.stepTimingSymmetry.value;
  const frontalAsym = features.frontalAsymmetry.value;
  if (stepSym > 0.95 && frontalAsym > 0.35 && features.frontalAsymmetry.confidence > 0.5) {
    warnings.push(
      'Cross-check: step timing is symmetric but frontal asymmetry is high. May be a camera angle artifact.'
    );
  }

  return warnings;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
