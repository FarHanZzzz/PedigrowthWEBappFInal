// PEDI-GROWTH — Quality Thresholds Policy (Graceful Degradation)
//
// LOW-RESOURCE DESIGN PRINCIPLE:
// This product serves users with imperfect equipment, lighting, and space.
// The system must degrade gracefully. It must produce partial, explicitly
// low-confidence results when SOME signal is available rather than refusing
// analysis entirely. Only refuse when the output would be random or misleading.
//
// THREE-TIER MODEL:
// 1. full_assessment — all quality metrics above pass thresholds
// 2. best_effort     — some metrics below pass but enough signal for partial analysis
// 3. cannot_assess   — catastrophic quality, output would be effectively random

import type { QualityResult, AssessmentMode } from '@/lib/types';

// ── Thresholds ────────────────────────────────────────────────────

export const QUALITY_THRESHOLDS = {
  // Each metric has three tiers:
  //   full:    above this = full confidence
  //   effort:  above this = best-effort partial analysis
  //   cannot:  below this = metric is unusable (if ALL are below → cannot_assess)

  bodyVisibility:   { full: 0.70, effort: 0.25, cannot: 0.15 },
  singlePerson:     { full: 0.80, effort: 0.50, cannot: 0.30 },
  cameraMotion:     { full: 0.30, effort: 0.70, cannot: 0.85 },      // inverted
  occlusion:        { full: 0.30, effort: 0.65, cannot: 0.80 },      // inverted
  frameUsability:   { full: 0.60, effort: 0.20, cannot: 0.10 },
  minGaitCycles:    { full: 2,    effort: 0,    cannot: -1 },         // 0 = any steps
  minResolution:    { full: { w: 640, h: 480 }, effort: { w: 320, h: 240 } },
} as const;

// ── Metrics that are robust enough for best-effort mode ────────────
// These survive lower quality. Others are suppressed.
const ROBUST_METRICS = ['cadence', 'stepSymmetry', 'frontalAsymmetry', 'strideRegularity'];
const FRAGILE_METRICS = ['lateralTrunkSway', 'pathDeviation', 'baseOfSupport'];
const ALL_METRICS = [...ROBUST_METRICS, ...FRAGILE_METRICS];

// ── Types ────────────────────────────────────────────────────────

interface QualityMetrics {
  bodyVisibility: number;
  singlePersonConfidence: number;
  cameraMotion: number;
  occlusionSeverity: number;
  frameUsabilityPct: number;
  detectedGaitCycles: number;
  resolutionWidth: number;
  resolutionHeight: number;
}

interface QualityDecision {
  result: QualityResult;
  assessmentMode: AssessmentMode;
  usableMetrics: string[];
  suppressedMetrics: string[];
  confidenceMultiplier: number;
  failureReasons: string[];
  borderlineReasons: string[];
  retakeInstructions: string | null;
  retakeSuggestions: string[];
  confidenceNotes: string;
}

// ── Evaluation ────────────────────────────────────────────────────

/**
 * Evaluate video quality and determine assessment mode.
 *
 * GRACEFUL DEGRADATION PRINCIPLE:
 * - cannot_assess is RARE — reserved for true catastrophic quality
 * - best_effort attempts analysis with reduced confidence
 * - Most home videos should produce at least best_effort
 */
export function evaluateQuality(metrics: QualityMetrics): QualityDecision {
  const issues: { metric: string; level: 'below_full' | 'below_effort' | 'catastrophic'; msg: string }[] = [];
  const retakeSuggestions: string[] = [];

  // ── Check each metric against 3-tier thresholds ──

  // Body visibility (higher is better)
  if (metrics.bodyVisibility < QUALITY_THRESHOLDS.bodyVisibility.cannot) {
    issues.push({ metric: 'bodyVisibility', level: 'catastrophic', msg: 'Person is barely visible in most frames.' });
  } else if (metrics.bodyVisibility < QUALITY_THRESHOLDS.bodyVisibility.effort) {
    issues.push({ metric: 'bodyVisibility', level: 'below_effort', msg: 'Body visibility is very low in this video.' });
    retakeSuggestions.push('Ensure the full body is visible from head to feet.');
  } else if (metrics.bodyVisibility < QUALITY_THRESHOLDS.bodyVisibility.full) {
    issues.push({ metric: 'bodyVisibility', level: 'below_full', msg: 'Body visibility is limited. Results may have reduced accuracy.' });
    retakeSuggestions.push('A clearer view of the full body would improve results.');
  }

  // Camera motion (lower is better)
  if (metrics.cameraMotion > QUALITY_THRESHOLDS.cameraMotion.cannot) {
    issues.push({ metric: 'cameraMotion', level: 'catastrophic', msg: 'Camera is extremely shaky — landmarks are jumping.' });
  } else if (metrics.cameraMotion > QUALITY_THRESHOLDS.cameraMotion.effort) {
    issues.push({ metric: 'cameraMotion', level: 'below_effort', msg: 'Camera is very shaky. Observations may be unreliable.' });
    retakeSuggestions.push('Place the phone on a stable surface or rest it against something steady.');
  } else if (metrics.cameraMotion > QUALITY_THRESHOLDS.cameraMotion.full) {
    issues.push({ metric: 'cameraMotion', level: 'below_full', msg: 'Some camera movement detected.' });
    retakeSuggestions.push('A steadier recording would improve accuracy.');
  }

  // Frame usability (higher is better)
  if (metrics.frameUsabilityPct < QUALITY_THRESHOLDS.frameUsability.cannot) {
    issues.push({ metric: 'frameUsability', level: 'catastrophic', msg: 'Almost no usable frames in this video.' });
  } else if (metrics.frameUsabilityPct < QUALITY_THRESHOLDS.frameUsability.effort) {
    issues.push({ metric: 'frameUsability', level: 'below_effort', msg: 'Many frames are unusable. Analysis will be limited.' });
    retakeSuggestions.push('Record in better lighting and avoid obstructions.');
  } else if (metrics.frameUsabilityPct < QUALITY_THRESHOLDS.frameUsability.full) {
    issues.push({ metric: 'frameUsability', level: 'below_full', msg: 'Some frames had limited quality.' });
  }

  // Occlusion (lower is better)
  if (metrics.occlusionSeverity > QUALITY_THRESHOLDS.occlusion.cannot) {
    issues.push({ metric: 'occlusion', level: 'catastrophic', msg: 'Body is mostly hidden by objects.' });
  } else if (metrics.occlusionSeverity > QUALITY_THRESHOLDS.occlusion.effort) {
    issues.push({ metric: 'occlusion', level: 'below_effort', msg: 'Significant obstructions detected.' });
    retakeSuggestions.push('Ensure a clear path with nothing blocking the view.');
  } else if (metrics.occlusionSeverity > QUALITY_THRESHOLDS.occlusion.full) {
    issues.push({ metric: 'occlusion', level: 'below_full', msg: 'Minor obstructions detected.' });
  }

  // Single person (higher is better)
  if (metrics.singlePersonConfidence < QUALITY_THRESHOLDS.singlePerson.cannot) {
    issues.push({ metric: 'singlePerson', level: 'catastrophic', msg: 'Cannot reliably detect a person in this video.' });
  } else if (metrics.singlePersonConfidence < QUALITY_THRESHOLDS.singlePerson.effort) {
    issues.push({ metric: 'singlePerson', level: 'below_effort', msg: 'Person detection confidence is very low.' });
    retakeSuggestions.push('Record with only one child in the frame.');
  } else if (metrics.singlePersonConfidence < QUALITY_THRESHOLDS.singlePerson.full) {
    issues.push({ metric: 'singlePerson', level: 'below_full', msg: 'Person detection confidence is limited.' });
  }

  // Gait cycles
  if (metrics.detectedGaitCycles < QUALITY_THRESHOLDS.minGaitCycles.effort) {
    issues.push({ metric: 'gaitCycles', level: 'below_effort', msg: 'No walking steps detected.' });
    retakeSuggestions.push('Record at least 4-6 walking steps.');
  } else if (metrics.detectedGaitCycles < QUALITY_THRESHOLDS.minGaitCycles.full) {
    issues.push({ metric: 'gaitCycles', level: 'below_full', msg: 'Only a few walking steps detected. More steps would improve accuracy.' });
    retakeSuggestions.push('A longer walk (6+ steps) gives more reliable results.');
  }

  // Resolution
  const resFull = QUALITY_THRESHOLDS.minResolution.full;
  const resEffort = QUALITY_THRESHOLDS.minResolution.effort;
  if (metrics.resolutionWidth < resEffort.w || metrics.resolutionHeight < resEffort.h) {
    issues.push({ metric: 'resolution', level: 'below_effort', msg: 'Video resolution is very low.' });
    retakeSuggestions.push('Use a higher camera quality setting if available.');
  } else if (metrics.resolutionWidth < resFull.w || metrics.resolutionHeight < resFull.h) {
    issues.push({ metric: 'resolution', level: 'below_full', msg: 'Video resolution is below ideal.' });
  }

  // ── Determine assessment mode ──

  const catastrophicCount = issues.filter(i => i.level === 'catastrophic').length;
  const belowEffortCount = issues.filter(i => i.level === 'below_effort').length;
  const belowFullCount = issues.filter(i => i.level === 'below_full').length;

  let assessmentMode: AssessmentMode;
  let confidenceMultiplier: number;

  // cannot_assess: 2+ catastrophic issues OR person completely undetectable
  if (catastrophicCount >= 2 ||
      (metrics.frameUsabilityPct < QUALITY_THRESHOLDS.frameUsability.cannot &&
       metrics.bodyVisibility < QUALITY_THRESHOLDS.bodyVisibility.cannot)) {
    assessmentMode = 'cannot_assess';
    confidenceMultiplier = 0;
  } else if (catastrophicCount >= 1 || belowEffortCount >= 2) {
    assessmentMode = 'best_effort';
    confidenceMultiplier = 0.35;
  } else if (belowEffortCount >= 1 || belowFullCount >= 2) {
    assessmentMode = 'best_effort';
    confidenceMultiplier = 0.5;
  } else if (belowFullCount >= 1) {
    assessmentMode = 'best_effort';
    confidenceMultiplier = 0.7;
  } else {
    assessmentMode = 'full_assessment';
    confidenceMultiplier = 1.0;
  }

  // ── Determine usable vs suppressed metrics ──
  // CRITICAL: In best_effort, ALL metrics are computed — we never hide data.
  // The confidence multiplier handles reliability, not suppression.
  // Suppressing metrics makes real patient pathology invisible.

  let usableMetrics: string[];
  let suppressedMetrics: string[];

  if (assessmentMode === 'cannot_assess') {
    usableMetrics = [];
    suppressedMetrics = ALL_METRICS;
  } else {
    // best_effort AND full_assessment: all metrics available
    usableMetrics = ALL_METRICS;
    suppressedMetrics = [];
  }

  // ── Legacy QualityResult mapping ──
  let result: QualityResult;
  if (assessmentMode === 'cannot_assess') result = 'fail';
  else if (assessmentMode === 'best_effort') result = 'borderline';
  else result = 'pass';

  // ── Human-facing messages ──
  const failureReasons = issues.filter(i => i.level === 'catastrophic').map(i => i.msg);
  const borderlineReasons = issues.filter(i => i.level !== 'catastrophic').map(i => i.msg);

  let retakeInstructions: string | null = null;
  if (assessmentMode === 'cannot_assess') {
    retakeInstructions = [
      'To get a usable recording:',
      '• Place your phone on a stable surface at waist height',
      '• Record from the front — have your child walk toward or away from the camera',
      '• Ensure only your child is in the frame, full body visible',
      '• Record at least 4-6 walking steps',
      '• Ensure adequate lighting',
    ].join('\n');
  }

  let confidenceNotes: string;
  if (assessmentMode === 'full_assessment') {
    confidenceNotes = 'Video quality supports a full analysis.';
  } else if (assessmentMode === 'best_effort') {
    confidenceNotes = 'Video quality is limited. We analyzed what we could. ' +
      'A better recording would improve confidence.';
  } else {
    confidenceNotes = 'We could not find enough signal in this video for a reliable analysis. ' +
      'Please try recording again following the guidance below.';
  }

  return {
    result,
    assessmentMode,
    usableMetrics,
    suppressedMetrics,
    confidenceMultiplier,
    failureReasons,
    borderlineReasons,
    retakeInstructions,
    retakeSuggestions,
    confidenceNotes,
  };
}
