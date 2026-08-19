// PEDI-GROWTH — Demo Fixtures (Frontal-First + Graceful Degradation)
// Seeded analysis results for fallback when MediaPipe is unavailable.
// All scenarios are FRONTAL. Includes best-effort fixture.

import type { AnalysisSessionResult } from './analysisSession';

type DemoFixtureResult = Omit<AnalysisSessionResult, 'run'>;

/**
 * Fixture 1: Good frontal video, full assessment, no concerns.
 */
export function goodFrontalFixture(nickname: string, ageMonths: number): DemoFixtureResult {
  return {
    id: 'demo_good_frontal',
    session: { nickname, ageMonths },
    assessmentMode: 'full_assessment',
    quality: {
      result: 'pass',
      assessmentMode: 'full_assessment',
      bodyVisibility: 0.91,
      cameraAngle: 'frontal',
      frameUsability: 0.87,
      durationSeconds: 7.5,
      confidenceMultiplier: 1.0,
      usableMetrics: ['cadence', 'stepSymmetry', 'frontalAsymmetry', 'strideRegularity', 'lateralTrunkSway', 'pathDeviation', 'baseOfSupport'],
      suppressedMetrics: [],
      failureReasons: [],
      borderlineReasons: [],
      retakeInstructions: null,
      retakeSuggestions: [],
      confidenceNotes: 'Video quality supports a full analysis.',
    },
    features: {
      cadence: { value: 126, confidence: 0.85, unit: 'steps/min' },
      stepSymmetry: { value: 0.93, confidence: 0.80 },
      frontalAsymmetry: { value: 0.06, confidence: 0.78 },
      strideRegularity: { value: 0.08, confidence: 0.76 },
      lateralTrunkSway: { value: 0.04, confidence: 0.82 },
      pathDeviation: { value: 0.05, confidence: 0.74 },
      baseOfSupport: { value: 0.12, confidence: 0.70, unit: 'normalized' },
    },
    concerns: {
      asymmetry: 'none',
      irregularRhythm: 'none',
      lateralInstability: 'none',
      pathDeviation: 'none',
      overallLevel: 'none',
      followupPriority: 'routine',
      isLimited: false,
      contextNotes: ['Analysis based on a front-view walking video.'],
      suppressedDomains: [],
      assessedDomains: ['asymmetry', 'irregularRhythm', 'lateralInstability', 'pathDeviation'],
      qualityWarning: false,
      viewLabel: 'Front-view walking assessment',
      assessmentModeLabel: 'Full assessment',
      assessmentMode: 'full_assessment',
    },
    viewType: 'frontal',
    isDemo: true,
    demoScenario: 'Full assessment — no concerns detected',
    policyVersion: '0.4.0-graceful',
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Fixture 2: Good frontal video, mild asymmetry + mild lateral instability.
 */
export function asymmetryFrontalFixture(nickname: string, ageMonths: number): DemoFixtureResult {
  return {
    id: 'demo_asymmetry_frontal',
    session: { nickname, ageMonths },
    assessmentMode: 'full_assessment',
    quality: {
      result: 'pass',
      assessmentMode: 'full_assessment',
      bodyVisibility: 0.84,
      cameraAngle: 'frontal',
      frameUsability: 0.79,
      durationSeconds: 6.8,
      confidenceMultiplier: 1.0,
      usableMetrics: ['cadence', 'stepSymmetry', 'frontalAsymmetry', 'strideRegularity', 'lateralTrunkSway', 'pathDeviation', 'baseOfSupport'],
      suppressedMetrics: [],
      failureReasons: [],
      borderlineReasons: [],
      retakeInstructions: null,
      retakeSuggestions: [],
      confidenceNotes: 'Video quality supports a full analysis.',
    },
    features: {
      cadence: { value: 118, confidence: 0.78, unit: 'steps/min' },
      stepSymmetry: { value: 0.82, confidence: 0.72 },
      frontalAsymmetry: { value: 0.19, confidence: 0.74 },
      strideRegularity: { value: 0.12, confidence: 0.68 },
      lateralTrunkSway: { value: 0.11, confidence: 0.76 },
      pathDeviation: { value: 0.08, confidence: 0.65 },
      baseOfSupport: { value: 0.10, confidence: 0.62, unit: 'normalized' },
    },
    concerns: {
      asymmetry: 'mild',
      irregularRhythm: 'none',
      lateralInstability: 'mild',
      pathDeviation: 'none',
      overallLevel: 'mild',
      followupPriority: 'routine',
      isLimited: false,
      contextNotes: ['Analysis based on a front-view walking video.'],
      suppressedDomains: [],
      assessedDomains: ['asymmetry', 'irregularRhythm', 'lateralInstability', 'pathDeviation'],
      qualityWarning: false,
      viewLabel: 'Front-view walking assessment',
      assessmentModeLabel: 'Full assessment',
      assessmentMode: 'full_assessment',
    },
    viewType: 'frontal',
    isDemo: true,
    demoScenario: 'Full assessment — mild asymmetry and lateral instability',
    policyVersion: '0.4.0-graceful',
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Fixture 3: BEST-EFFORT — lower quality video, partial analysis.
 * Demonstrates the graceful degradation path.
 * Fragile metrics (lateralTrunkSway, pathDeviation, baseOfSupport) suppressed.
 * Concerns capped at mild.
 */
export function bestEffortFixture(nickname: string, ageMonths: number): DemoFixtureResult {
  return {
    id: 'demo_best_effort',
    session: { nickname, ageMonths },
    assessmentMode: 'best_effort',
    quality: {
      result: 'borderline',
      assessmentMode: 'best_effort',
      bodyVisibility: 0.42,
      cameraAngle: 'frontal',
      frameUsability: 0.38,
      durationSeconds: 5.2,
      confidenceMultiplier: 0.5,
      usableMetrics: ['cadence', 'stepSymmetry', 'frontalAsymmetry', 'strideRegularity'],
      suppressedMetrics: ['lateralTrunkSway', 'pathDeviation', 'baseOfSupport'],
      failureReasons: [],
      borderlineReasons: [
        'Body visibility is limited. Results may have reduced accuracy.',
        'Some frames had limited quality.',
      ],
      retakeInstructions: null,
      retakeSuggestions: [
        'A clearer view of the full body would improve results.',
        'Record in better lighting and avoid obstructions.',
      ],
      confidenceNotes: 'Video quality is limited. We analyzed what we could. A better recording would improve confidence.',
    },
    features: {
      cadence: { value: 108, confidence: 0.38, unit: 'steps/min' },
      stepSymmetry: { value: 0.79, confidence: 0.32 },
      frontalAsymmetry: { value: 0.14, confidence: 0.30 },
      strideRegularity: { value: 0.22, confidence: 0.35 },
      lateralTrunkSway: { value: 0, confidence: 0, limitedReason: 'Not assessed — video quality insufficient for this metric.', suppressed: true },
      pathDeviation: { value: 0, confidence: 0, limitedReason: 'Not assessed — video quality insufficient for this metric.', suppressed: true },
      baseOfSupport: { value: 0, confidence: 0, limitedReason: 'Not assessed — video quality insufficient for this metric.', suppressed: true },
    },
    concerns: {
      asymmetry: 'mild',
      irregularRhythm: 'mild',
      lateralInstability: 'none',
      pathDeviation: 'none',
      overallLevel: 'mild',
      followupPriority: 'routine',
      isLimited: false,
      contextNotes: [
        'This is a preliminary analysis based on a lower-quality recording. Some measurements may be less reliable. A better recording would improve confidence.',
        'Analysis based on a front-view walking video.',
        'Could not reliably assess: lateralInstability, pathDeviation. A higher quality recording may help.',
        'Assessed with reduced confidence: asymmetry, irregularRhythm.',
      ],
      suppressedDomains: ['lateralInstability', 'pathDeviation'],
      assessedDomains: ['asymmetry', 'irregularRhythm'],
      qualityWarning: true,
      viewLabel: 'Front-view walking assessment',
      assessmentModeLabel: 'Preliminary analysis',
      assessmentMode: 'best_effort',
    },
    viewType: 'frontal',
    isDemo: true,
    demoScenario: 'Best-effort — lower quality video, partial analysis with disclaimers',
    policyVersion: '0.4.0-graceful',
    analyzedAt: new Date().toISOString(),
  };
}

/** Pick a demo fixture based on a hash of the input */
export function selectDemoFixture(
  nickname: string,
  ageMonths: number,
  hint?: number,
): DemoFixtureResult {
  const fixtures = [goodFrontalFixture, asymmetryFrontalFixture, bestEffortFixture];
  const idx = hint !== undefined ? hint % fixtures.length : Math.floor(Math.random() * fixtures.length);
  return fixtures[idx](nickname, ageMonths);
}
