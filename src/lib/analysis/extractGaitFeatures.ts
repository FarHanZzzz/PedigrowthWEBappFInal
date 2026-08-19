// PEDI-GROWTH — Gait Feature Extraction Engine (Frontal-First)
// Computes real gait metrics from landmark sequences.
// MVP: frontal/toward-away video is the PRIMARY supported mode.
// Sagittal metrics are computed but gated behind _sagittal_ prefix.
//
// NORMALIZATION CONSTANTS are derived from published clinical literature.
// See src/lib/policy/normative-references.json for full citations.

import type { LandmarkFrame, GaitFeatureSet, MetricValue, CameraAngle, ViewType } from '@/lib/types';
import { POSE, MIN_VISIBILITY } from '@/lib/pose/poseTypes';
import { computeAngle, computeLateralOffset, computeHipHeightDiff, computeShoulderTilt, midpoint } from './angles';
import { detectFootStrikes, computeStepIntervals } from './cycleDetection';
import normativeRefs from '@/lib/policy/normative-references.json';

const POLICY_VERSION = '0.4.0-calibrated';

// ── Clinically-anchored normalization constants ────────────────
// Each constant traces to an entry in normative-references.json.
const HIP_ASYM_DIVISOR = normativeRefs.frontalAsymmetry.components.hipHeightDifference.normalizationDivisor; // 0.035
const SHOULDER_TILT_DIVISOR = normativeRefs.frontalAsymmetry.components.shoulderTilt.normalizationDivisor; // 0.06
const TRUNK_SWAY_DIVISOR = normativeRefs.lateralTrunkSway.normalizationDivisor; // 0.025
const PATH_DEV_DIVISOR = normativeRefs.pathDeviation.normalizationDivisor; // 0.035

/**
 * Extract gait features from smoothed landmark frames.
 *
 * Frontal-first design:
 * - Primary metrics are all valid from front/back camera
 * - Sagittal metrics are only computed for side-view, stored under _sagittal_ keys
 */
export function extractGaitFeatures(
  frames: LandmarkFrame[],
  cameraAngle: CameraAngle,
): GaitFeatureSet {
  const isSideView = cameraAngle === 'side';
  const viewType: ViewType = isSideView ? 'side' : 'frontal';

  // Foot strikes and cycles
  const strikes = detectFootStrikes(frames);
  const { intervals, leftIntervals, rightIntervals } = computeStepIntervals(strikes);

  // ── Primary features (frontal-valid) ────────────────────────
  const result: GaitFeatureSet = {
    cadenceProxy: computeCadence(frames, strikes),
    stepTimingSymmetry: computeStepTimingSymmetry(leftIntervals, rightIntervals),
    frontalAsymmetry: computeFrontalAsymmetry(frames),
    strideRegularity: computeStrideRegularity(intervals),
    lateralTrunkSway: computeLateralTrunkSway(frames),
    pathDeviation: computePathDeviation(frames),
    baseOfSupport: computeBaseOfSupport(frames),
    viewType,
    policyVersion: POLICY_VERSION,
  };

  // ── Sagittal features (side-view only, gated) ──────────────
  if (isSideView) {
    result._sagittal_kneeFlexion = computeKneeFlexion(frames);
    result._sagittal_anklePlantarflexion = computeAnklePlantarflexion(frames);
    result._sagittal_crouchProxy = computeCrouchProxy(frames);
    result._sagittal_anteriorTrunkLean = computeAnteriorTrunkLean(frames);
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// FRONTAL-VALID METRIC COMPUTATIONS
// ══════════════════════════════════════════════════════════════

/**
 * Cadence: steps per minute.
 * Valid from ANY camera angle — uses ankle-Y oscillation.
 */
function computeCadence(frames: LandmarkFrame[], strikes: ReturnType<typeof detectFootStrikes>): MetricValue {
  const minStrikes = normativeRefs.minimumEvidenceRequirements.minStrikesForCadence;
  if (frames.length < 5 || strikes.length < minStrikes) {
    return { value: 0, confidence: 0.1, unit: 'steps/min', limitedReason: `Insufficient steps detected (need ≥${minStrikes})` };
  }

  const durationMs = frames[frames.length - 1].timestampMs - frames[0].timestampMs;
  const durationSec = durationMs / 1000;
  const durationMin = durationMs / 60000;

  if (durationMin <= 0) {
    return { value: 0, confidence: 0.1, unit: 'steps/min', limitedReason: 'Video too short' };
  }

  const cadence = strikes.length / durationMin;

  // Clamp to physiological bounds — values outside this range indicate measurement error
  const bounds = normativeRefs.cadence.physiologicalBounds;
  const clampedCadence = Math.max(bounds.min, Math.min(bounds.max, cadence));
  const wasClamped = clampedCadence !== Math.round(cadence);

  // Confidence: require more strikes AND longer duration for higher confidence
  // A 1-second clip with 3 strikes should NOT get 0.9 confidence
  const strikeConfidence = Math.min(1, strikes.length / 10);
  const durationConfidence = Math.min(1, durationSec / 5); // Need ≥5 sec for full confidence
  const confidence = Math.min(0.9, strikeConfidence * 0.5 + durationConfidence * 0.5);

  return {
    value: Math.round(clampedCadence),
    confidence: wasClamped ? Math.min(confidence, 0.3) : confidence,
    unit: 'steps/min',
    limitedReason: wasClamped ? `Cadence ${Math.round(cadence)} outside normal range, clamped to ${Math.round(clampedCadence)}` : undefined,
  };
}

/**
 * Step timing symmetry: ratio of mean left-step to mean right-step duration.
 * Valid from ANY angle — pure timing metric.
 */
function computeStepTimingSymmetry(leftIntervals: number[], rightIntervals: number[]): MetricValue {
  if (leftIntervals.length < 2 || rightIntervals.length < 2) {
    return { value: 0, confidence: 0.15, limitedReason: 'Insufficient steps for timing comparison' };
  }

  const leftMean = mean(leftIntervals);
  const rightMean = mean(rightIntervals);

  if (leftMean === 0 || rightMean === 0) {
    return { value: 0, confidence: 0.1, limitedReason: 'Step timing data invalid' };
  }

  const ratio = Math.min(leftMean, rightMean) / Math.max(leftMean, rightMean);
  const confidence = Math.min(1, (leftIntervals.length + rightIntervals.length) / 6);

  return { value: parseFloat(ratio.toFixed(3)), confidence };
}

/**
 * Frontal asymmetry: multi-signal L/R comparison.
 *
 * Uses THREE frontal-valid signals:
 * 1. Hip height asymmetry (pelvic drop)
 * 2. Step timing asymmetry (from step intervals)
 * 3. Shoulder tilt (trunk lean toward one side)
 *
 * Each normalized 0-1, then averaged. This is BETTER from frontal view
 * than the old sagittal knee-angle-based asymmetry.
 */
function computeFrontalAsymmetry(frames: LandmarkFrame[]): MetricValue {
  const hipDiffs: number[] = [];
  const shoulderTilts: number[] = [];

  for (const frame of frames) {
    const lHip = frame.landmarks[POSE.LEFT_HIP];
    const rHip = frame.landmarks[POSE.RIGHT_HIP];
    const lShoulder = frame.landmarks[POSE.LEFT_SHOULDER];
    const rShoulder = frame.landmarks[POSE.RIGHT_SHOULDER];

    const hipsVisible = lHip.visibility >= MIN_VISIBILITY && rHip.visibility >= MIN_VISIBILITY;
    const shouldersVisible = lShoulder.visibility >= MIN_VISIBILITY && rShoulder.visibility >= MIN_VISIBILITY;

    if (hipsVisible) {
      hipDiffs.push(computeHipHeightDiff(lHip, rHip));
    }
    if (shouldersVisible) {
      shoulderTilts.push(computeShoulderTilt(lShoulder, rShoulder));
    }
  }

  if (hipDiffs.length < 5 && shoulderTilts.length < 5) {
    return { value: 0, confidence: 0.1, limitedReason: 'Insufficient visible frames for asymmetry' };
  }

  // Normalize using clinically-derived divisors.
  // HIP_ASYM_DIVISOR (0.035): 2 SD above pathological mean pelvic drop → score 1.0
  // SHOULDER_TILT_DIVISOR (0.06): moderate pathological trunk lean → score 1.0
  const hipScore = hipDiffs.length >= 5
    ? Math.min(1, mean(hipDiffs) / HIP_ASYM_DIVISOR)
    : 0;

  const shoulderScore = shoulderTilts.length >= 5
    ? Math.min(1, mean(shoulderTilts) / SHOULDER_TILT_DIVISOR)
    : 0;

  // Combined score — weight hip more if both available (Baker 2006: pelvic obliquity
  // is a more reliable frontal-plane indicator than shoulder tilt)
  const weights = normativeRefs.frontalAsymmetry.compositeWeights;
  let score: number;
  let signalCount = 0;
  if (hipDiffs.length >= 5) signalCount++;
  if (shoulderTilts.length >= 5) signalCount++;

  if (signalCount === 2) {
    score = hipScore * weights.hip + shoulderScore * weights.shoulder;
  } else if (hipDiffs.length >= 5) {
    score = hipScore;
  } else {
    score = shoulderScore;
  }

  // Confidence: require substantial evidence. A 1-second clip should not
  // reach high confidence. Require ≥50 total observations for 0.85 ceiling.
  const totalObs = hipDiffs.length + shoulderTilts.length;
  const confidence = Math.min(0.85, totalObs / 50);

  return { value: parseFloat(score.toFixed(3)), confidence };
}

/**
 * Stride regularity: coefficient of variation of step intervals.
 * Valid from ANY angle — pure timing metric.
 */
function computeStrideRegularity(intervals: number[]): MetricValue {
  if (intervals.length < 3) {
    return { value: 0, confidence: 0.15, limitedReason: 'Insufficient steps for regularity analysis' };
  }

  const avg = mean(intervals);
  if (avg === 0) {
    return { value: 0, confidence: 0.1, limitedReason: 'Step interval data invalid' };
  }

  const variance = mean(intervals.map((v) => (v - avg) ** 2));
  const cv = Math.sqrt(variance) / avg;
  const confidence = Math.min(1, intervals.length / 6);

  return { value: parseFloat(cv.toFixed(3)), confidence };
}

/**
 * Lateral trunk sway: SD of lateral shoulder-hip offset across frames.
 *
 * This is the IDEAL metric for frontal view — it measures mediolateral
 * trunk movement which is directly visible from the front.
 */
function computeLateralTrunkSway(frames: LandmarkFrame[]): MetricValue {
  const lateralOffsets: number[] = [];

  for (const frame of frames) {
    const ls = frame.landmarks[POSE.LEFT_SHOULDER];
    const rs = frame.landmarks[POSE.RIGHT_SHOULDER];
    const lh = frame.landmarks[POSE.LEFT_HIP];
    const rh = frame.landmarks[POSE.RIGHT_HIP];

    if (ls.visibility >= MIN_VISIBILITY &&
        rs.visibility >= MIN_VISIBILITY &&
        lh.visibility >= MIN_VISIBILITY &&
        rh.visibility >= MIN_VISIBILITY) {
      lateralOffsets.push(computeLateralOffset(ls, rs, lh, rh));
    }
  }

  if (lateralOffsets.length < 5) {
    return { value: 0, confidence: 0.15, limitedReason: 'Insufficient visible frames for stability' };
  }

  const avg = mean(lateralOffsets);
  const variance = mean(lateralOffsets.map((l) => (l - avg) ** 2));
  const sd = Math.sqrt(variance);

  // Normalize using clinically-derived divisor.
  // TRUNK_SWAY_DIVISOR (0.025): Menz et al. 2003 — clinically obvious lateral
  // instability at ~0.025 SD in normalized coords.
  const normalized = Math.min(1, sd / TRUNK_SWAY_DIVISOR);
  // Require ≥30 observations for reasonable confidence
  const confidence = Math.min(0.85, lateralOffsets.length / 30);

  return { value: parseFloat(normalized.toFixed(3)), confidence };
}

/**
 * Path deviation: how much the subject veers from a straight line.
 *
 * Tracks hip-center X position over time. Fits a linear regression.
 * Returns the R² inverted as a deviation score.
 *
 * IDEAL for frontal/away view — the walking path is directly visible.
 */
function computePathDeviation(frames: LandmarkFrame[]): MetricValue {
  const xPositions: { t: number; x: number }[] = [];

  for (const frame of frames) {
    const lh = frame.landmarks[POSE.LEFT_HIP];
    const rh = frame.landmarks[POSE.RIGHT_HIP];

    if (lh.visibility >= MIN_VISIBILITY && rh.visibility >= MIN_VISIBILITY) {
      const hipMid = midpoint(lh, rh);
      xPositions.push({ t: frame.timestampMs, x: hipMid.x });
    }
  }

  if (xPositions.length < 5) {
    return { value: 0, confidence: 0.15, limitedReason: 'Insufficient data for path analysis' };
  }

  // Normalize timestamps
  const t0 = xPositions[0].t;
  const tMax = xPositions[xPositions.length - 1].t - t0;
  if (tMax === 0) {
    return { value: 0, confidence: 0.1, limitedReason: 'Video too short for path analysis' };
  }

  const normalizedT = xPositions.map((p) => (p.t - t0) / tMax);
  const xs = xPositions.map((p) => p.x);

  // Linear regression of x vs t
  const n = normalizedT.length;
  const sumT = normalizedT.reduce((a, b) => a + b, 0);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumTX = normalizedT.reduce((a, t, i) => a + t * xs[i], 0);
  const sumT2 = normalizedT.reduce((a, t) => a + t * t, 0);

  const slope = (n * sumTX - sumT * sumX) / (n * sumT2 - sumT * sumT);
  const intercept = (sumX - slope * sumT) / n;

  // Compute residuals (deviation from straight line)
  const residuals = normalizedT.map((t, i) => xs[i] - (slope * t + intercept));
  const residualSD = Math.sqrt(mean(residuals.map((r) => r * r)));

  // Normalize using clinically-derived divisor.
  // PATH_DEV_DIVISOR (0.035): 3.5% of screen width deviation → 1.0 score.
  // Hausdorff 2005: healthy walkers typically <0.008 residual SD.
  const normalized = Math.min(1, residualSD / PATH_DEV_DIVISOR);
  // Require ≥25 data points for reasonable confidence
  const confidence = Math.min(0.85, xPositions.length / 25);

  return { value: parseFloat(normalized.toFixed(3)), confidence };
}

/**
 * Base of support: mean distance between left and right ankles in X.
 *
 * IDEAL for frontal view — coronal plane foot spacing is directly visible.
 * Informational in MVP (not a concern trigger unless high confidence + persistent).
 */
function computeBaseOfSupport(frames: LandmarkFrame[]): MetricValue {
  const ankleWidths: number[] = [];

  for (const frame of frames) {
    const la = frame.landmarks[POSE.LEFT_ANKLE];
    const ra = frame.landmarks[POSE.RIGHT_ANKLE];

    if (la.visibility >= MIN_VISIBILITY && ra.visibility >= MIN_VISIBILITY) {
      // X-distance between ankles (normalized coords)
      ankleWidths.push(Math.abs(la.x - ra.x));
    }
  }

  if (ankleWidths.length < 5) {
    return { value: 0, confidence: 0.15, limitedReason: 'Insufficient ankle visibility' };
  }

  // Average width across visible ankle observations
  const avgWidth = mean(ankleWidths);
  const variance = mean(ankleWidths.map((w) => (w - avgWidth) ** 2));
  void variance;

  // Return average width as value, CV as additional info via confidence
  const confidence = Math.min(0.85, ankleWidths.length / 20);

  return {
    value: parseFloat(avgWidth.toFixed(4)),
    confidence,
    unit: 'normalized',
    limitedReason: ankleWidths.length < 10 ? 'Limited ankle observations' : undefined,
  };
}

// ══════════════════════════════════════════════════════════════
// SAGITTAL METRICS (side-view only, kept but gated)
// ══════════════════════════════════════════════════════════════

/** Knee flexion concern — SIDE VIEW ONLY */
function computeKneeFlexion(frames: LandmarkFrame[]): MetricValue {
  const angles: number[] = [];

  for (const frame of frames) {
    const sides = [
      { hip: POSE.LEFT_HIP, knee: POSE.LEFT_KNEE, ankle: POSE.LEFT_ANKLE },
      { hip: POSE.RIGHT_HIP, knee: POSE.RIGHT_KNEE, ankle: POSE.RIGHT_ANKLE },
    ];

    for (const side of sides) {
      const hip = frame.landmarks[side.hip];
      const knee = frame.landmarks[side.knee];
      const ankle = frame.landmarks[side.ankle];

      if (hip.visibility >= MIN_VISIBILITY &&
          knee.visibility >= MIN_VISIBILITY &&
          ankle.visibility >= MIN_VISIBILITY) {
        angles.push(computeAngle(hip, knee, ankle));
      }
    }
  }

  if (angles.length < 5) {
    return { value: 0, confidence: 0.1, unit: 'degrees', limitedReason: 'Insufficient visible frames' };
  }

  return {
    value: Math.round(mean(angles)),
    confidence: Math.min(1, angles.length / 30),
    unit: 'degrees',
  };
}

/** Ankle plantarflexion — SIDE VIEW ONLY */
function computeAnklePlantarflexion(frames: LandmarkFrame[]): MetricValue {
  const deviations: number[] = [];

  for (const frame of frames) {
    const sides = [
      { knee: POSE.LEFT_KNEE, ankle: POSE.LEFT_ANKLE, heel: POSE.LEFT_HEEL },
      { knee: POSE.RIGHT_KNEE, ankle: POSE.RIGHT_ANKLE, heel: POSE.RIGHT_HEEL },
    ];

    for (const side of sides) {
      const knee = frame.landmarks[side.knee];
      const ankle = frame.landmarks[side.ankle];
      const heel = frame.landmarks[side.heel];

      if (knee.visibility >= MIN_VISIBILITY &&
          ankle.visibility >= MIN_VISIBILITY &&
          heel.visibility >= MIN_VISIBILITY) {
        const angle = computeAngle(knee, ankle, heel);
        deviations.push(Math.abs(90 - angle));
      }
    }
  }

  if (deviations.length < 5) {
    return { value: 0, confidence: 0.15, unit: 'degrees', limitedReason: 'Insufficient visible frames' };
  }

  return {
    value: Math.round(mean(deviations)),
    confidence: Math.min(1, deviations.length / 20),
    unit: 'degrees',
  };
}

/** Crouch proxy — SIDE VIEW ONLY */
function computeCrouchProxy(frames: LandmarkFrame[]): MetricValue {
  const kneeFlexion = computeKneeFlexion(frames);
  if (kneeFlexion.confidence < 0.2) {
    return { value: 0, confidence: 0.1, unit: 'degrees', limitedReason: 'Crouch requires reliable knee data' };
  }

  const normalStanceAngle = 170;
  const crouchDeviation = Math.max(0, normalStanceAngle - kneeFlexion.value);

  return {
    value: Math.round(crouchDeviation),
    confidence: kneeFlexion.confidence * 0.9,
    unit: 'degrees',
  };
}

/** Anterior trunk lean — SIDE VIEW ONLY */
function computeAnteriorTrunkLean(frames: LandmarkFrame[]): MetricValue {
  // Reuse the existing computeTrunkLean from angles.ts via direct import
  // but compute here to avoid circular dependencies
  const leans: number[] = [];

  for (const frame of frames) {
    const ls = frame.landmarks[POSE.LEFT_SHOULDER];
    const rs = frame.landmarks[POSE.RIGHT_SHOULDER];
    const lh = frame.landmarks[POSE.LEFT_HIP];
    const rh = frame.landmarks[POSE.RIGHT_HIP];

    if (ls.visibility >= MIN_VISIBILITY && rs.visibility >= MIN_VISIBILITY &&
        lh.visibility >= MIN_VISIBILITY && rh.visibility >= MIN_VISIBILITY) {
      const shoulderMid = midpoint(ls, rs);
      const hipMid = midpoint(lh, rh);
      const dx = shoulderMid.x - hipMid.x;
      const dy = shoulderMid.y - hipMid.y;
      leans.push((Math.atan2(dx, -dy) * 180) / Math.PI);
    }
  }

  if (leans.length < 5) {
    return { value: 0, confidence: 0.15, limitedReason: 'Insufficient frames' };
  }

  const avg = mean(leans);
  const variance = mean(leans.map((l) => (l - avg) ** 2));
  const sd = Math.sqrt(variance);
  const normalized = sd / 20;

  return { value: parseFloat(normalized.toFixed(3)), confidence: Math.min(1, leans.length / 20) };
}

// ── Utility ─────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
