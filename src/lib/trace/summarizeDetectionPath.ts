// PEDI-GROWTH — Detection Path Summarizer
// Generates human-readable explanations for each concern card.
// Answers: what signal, which frames, what confidence, what was missing.

import type { AnalysisTrace } from './traceTypes';

export interface ConcernEvidence {
  domain: string;
  displayName: string;
  level: string;
  explanation: string;
  signalDescription: string;
  frameRange: string;
  frameCount: number;
  confidence: number;
  missingInfo: string | null;
}

/**
 * For each concern domain, build a human-readable evidence summary
 * from the analysis trace.
 */
export function summarizeDetectionPath(
  trace: AnalysisTrace,
  concerns: Record<string, string>, // domain → concern level
): ConcernEvidence[] {
  const evidence: ConcernEvidence[] = [];

  // Asymmetry
  evidence.push(buildDomainEvidence(
    trace,
    'asymmetry',
    'Asymmetry',
    concerns.asymmetry || 'none',
    'frontalAsymmetry',
    'Hip height difference and shoulder tilt between left and right sides',
  ));

  // Irregular rhythm
  evidence.push(buildDomainEvidence(
    trace,
    'irregularRhythm',
    'Rhythm regularity',
    concerns.irregularRhythm || 'none',
    'strideRegularity',
    'Variability in step timing intervals',
  ));

  // Lateral instability
  evidence.push(buildDomainEvidence(
    trace,
    'lateralInstability',
    'Lateral stability',
    concerns.lateralInstability || 'none',
    'lateralTrunkSway',
    'Side-to-side trunk movement during walking',
  ));

  // Path deviation
  evidence.push(buildDomainEvidence(
    trace,
    'pathDeviation',
    'Path deviation',
    concerns.pathDeviation || 'none',
    'pathDeviation',
    'Deviation from a straight walking path',
  ));

  return evidence;
}

function buildDomainEvidence(
  trace: AnalysisTrace,
  domain: string,
  displayName: string,
  level: string,
  metricKey: string,
  signalDescription: string,
): ConcernEvidence {
  const source = trace.metricSources[metricKey];
  const suppressed = trace.suppressedMetrics.find(s => s.metricName === metricKey);

  if (suppressed) {
    return {
      domain,
      displayName,
      level: 'none',
      explanation: `Could not assess ${displayName.toLowerCase()}. ${suppressed.reason}`,
      signalDescription,
      frameRange: 'N/A',
      frameCount: suppressed.availableFrames,
      confidence: 0,
      missingInfo: `Needed ${suppressed.requiredFrames} usable frames, had ${suppressed.availableFrames}.`,
    };
  }

  if (!source) {
    return {
      domain,
      displayName,
      level,
      explanation: `${displayName} was assessed but source data is not available in the trace.`,
      signalDescription,
      frameRange: 'N/A',
      frameCount: 0,
      confidence: 0,
      missingInfo: null,
    };
  }

  const confidencePct = Math.round(source.confidence * 100);
  const frameIndices = source.usedFrameIndices;
  let frameRange = 'N/A';
  if (frameIndices.length > 0) {
    const firstMs = trace.frames[frameIndices[0]]?.timestampMs ?? 0;
    const lastMs = trace.frames[frameIndices[frameIndices.length - 1]]?.timestampMs ?? 0;
    frameRange = `${(firstMs / 1000).toFixed(1)}s – ${(lastMs / 1000).toFixed(1)}s`;
  }

  let explanation: string;
  if (level === 'none') {
    explanation = `No notable ${displayName.toLowerCase()} observed. Measured ${source.finalValue.toFixed(3)}${source.unit ? ' ' + source.unit : ''} across ${source.frameCount} frames (${confidencePct}% confidence).`;
  } else {
    const levelWord = level === 'mild' ? 'some' : level === 'moderate' ? 'notable' : 'significant';
    explanation = `We observed ${levelWord} ${displayName.toLowerCase()}. Measured ${source.finalValue.toFixed(3)}${source.unit ? ' ' + source.unit : ''} across ${source.frameCount} frames (${confidencePct}% confidence).`;
  }

  if (trace.assessmentMode === 'best_effort') {
    explanation += ' This is a preliminary observation from a lower-quality recording.';
  }

  const missingInfo = source.frameCount < 10
    ? `Only ${source.frameCount} frames contributed. More walking data would strengthen this observation.`
    : null;

  return {
    domain,
    displayName,
    level,
    explanation,
    signalDescription,
    frameRange,
    frameCount: source.frameCount,
    confidence: source.confidence,
    missingInfo,
  };
}
