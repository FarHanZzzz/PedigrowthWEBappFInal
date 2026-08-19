import { checkLanguageSafety } from '@/lib/policy/language-safety';
import type { AssessmentMode, CaregiverReport, ClinicianPacket } from '@/lib/types';
import type { AnalysisTrace } from '@/lib/trace/traceTypes';

interface FeatureMetric {
  value: number;
  confidence: number;
  unit?: string;
  limitedReason?: string;
  suppressed?: boolean;
}

interface ConcernSnapshot {
  asymmetry: string;
  irregularRhythm: string;
  lateralInstability: string;
  pathDeviation: string;
  overallLevel: string;
  followupPriority: string;
  contextNotes: string[];
  suppressedDomains: string[];
  assessedDomains: string[];
  qualityWarning: boolean;
  viewLabel: string;
  assessmentModeLabel: string;
  assessmentMode: AssessmentMode;
}

interface QualitySnapshot {
  result: string;
  cameraAngle: string;
  confidenceMultiplier: number;
  confidenceNotes: string;
  failureReasons: string[];
  borderlineReasons: string[];
  suppressedMetrics: string[];
}

interface IntakeContextSnapshot {
  caregiverMainConcern?: string | null;
  symptomDuration?: string | null;
  fallsFrequency?: string | null;
  recentTherapyChanges?: string | null;
  recentSurgeryInterventionChanges?: string | null;
  assistiveDeviceSupport?: string | null;
  priorDiagnosisOrSpecialistReview?: string | null;
  correctedAge?: string | null;
}

export interface BuildReportBundleInput {
  assessmentId: string;
  nickname: string;
  ageMonths: number;
  intakeContext?: IntakeContextSnapshot;
  analyzedAt: string;
  concerns: ConcernSnapshot;
  quality: QualitySnapshot;
  features: Record<string, FeatureMetric>;
  trace?: AnalysisTrace;
}

export interface ReportBundle {
  caregiverReport: CaregiverReport;
  clinicianPacket: ClinicianPacket;
  handoffText: string;
}

const REPORT_VERSION = 1;

function fallbackSafeText(): string {
  return 'This report summarizes observable movement patterns from one video and does not provide a diagnosis.';
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function enforceSafeLanguage(text: string): string {
  const cleaned = normalizeWhitespace(text)
    .replace(/\bdiagnos(e|is|ed|ing)\b/gi, 'assess')
    .replace(/\bdefinitiv(e|ely)\b/gi, 'careful')
    .replace(/\bcertainty\b/gi, 'confidence context');

  const safety = checkLanguageSafety(cleaned);
  if (safety.safe) return cleaned;
  return fallbackSafeText();
}

function normalizeContextField(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function overallObservation(level: string): string {
  switch (level) {
    case 'significant':
      return 'This clip shows movement patterns that should be reviewed with a clinician soon.';
    case 'moderate':
      return 'This clip shows movement patterns that are worth clinician follow-up.';
    case 'mild':
      return 'This clip shows mild movement differences that are useful to monitor and discuss during follow-up.';
    default:
      return 'No notable movement concern signals were observed in this clip.';
  }
}

function followupGuidance(priority: string): string {
  switch (priority) {
    case 'specialist':
      return 'Please arrange a specialist follow-up and bring this packet for structured review.';
    case 'earlier_review':
      return 'Plan an earlier follow-up appointment and share this packet with your clinician.';
    default:
      return 'Continue routine monitoring and bring this summary to your next check-in if concerns persist.';
  }
}

function clipContextText(value: string): string {
  return value.length > 140 ? `${value.slice(0, 137)}...` : value;
}

function buildCaregiverContextSignal(input?: IntakeContextSnapshot): string | null {
  const mainConcern = normalizeContextField(input?.caregiverMainConcern);
  const duration = normalizeContextField(input?.symptomDuration);
  const falls = normalizeContextField(input?.fallsFrequency);

  if (!mainConcern && !duration && !falls) {
    return null;
  }

  const parts: string[] = [];
  if (mainConcern) {
    parts.push(`Caregiver concern: ${clipContextText(mainConcern)}.`);
  }
  if (duration) {
    parts.push(`First noticed: ${clipContextText(duration)}.`);
  }
  if (falls) {
    parts.push(`Falls frequency reported: ${clipContextText(falls)}.`);
  }

  return enforceSafeLanguage(parts.join(" "));
}

function buildMetricTable(features: Record<string, FeatureMetric>): Record<string, unknown> {
  const formatted: Record<string, unknown> = {};

  for (const [metricName, metric] of Object.entries(features)) {
    formatted[metricName] = {
      value: metric.suppressed ? null : metric.value,
      unit: metric.unit ?? null,
      confidencePct: metric.suppressed ? 0 : Math.round(metric.confidence * 100),
      assessed: !metric.suppressed,
      limitation: metric.limitedReason ?? null,
    };
  }

  return formatted;
}

function buildConcernDomains(concerns: ConcernSnapshot): Record<string, unknown> {
  return {
    asymmetry: concerns.asymmetry,
    irregularRhythm: concerns.irregularRhythm,
    lateralInstability: concerns.lateralInstability,
    pathDeviation: concerns.pathDeviation,
    overallLevel: concerns.overallLevel,
    followupPriority: concerns.followupPriority,
    assessedDomains: concerns.assessedDomains,
    suppressedDomains: concerns.suppressedDomains,
    qualityWarning: concerns.qualityWarning,
    notes: concerns.contextNotes,
  };
}

function buildHandoffText(
  nickname: string,
  caregiverReport: CaregiverReport,
  clinicianPacket: ClinicianPacket,
): string {
  const concernDomains = clinicianPacket.concernDomains as {
    overallLevel?: string;
    assessedDomains?: string[];
    suppressedDomains?: string[];
    followupPriority?: string;
  };

  return [
    `GAITBRIDGE Clinician Handoff - ${nickname}`,
    `Assessment ID: ${caregiverReport.assessmentId}`,
    `Observed summary: ${caregiverReport.observationsText}`,
    `Confidence context: ${caregiverReport.confidenceText}`,
    `Limitations: ${caregiverReport.limitationsText}`,
    `Overall concern level: ${concernDomains.overallLevel ?? 'unknown'}`,
    `Assessed domains: ${(concernDomains.assessedDomains ?? []).join(', ') || 'none'}`,
    `Suppressed domains: ${(concernDomains.suppressedDomains ?? []).join(', ') || 'none'}`,
    `Follow-up priority: ${concernDomains.followupPriority ?? 'routine'}`,
    `Recommended action: ${caregiverReport.professionalEvalGuidance}`,
  ].join('\n');
}

export function buildReportBundle(input: BuildReportBundleInput): ReportBundle {
  const createdAt = input.analyzedAt;
  const observationText = enforceSafeLanguage(overallObservation(input.concerns.overallLevel));
  const contextSignalText = buildCaregiverContextSignal(input.intakeContext);

  const confidenceText = enforceSafeLanguage(
    input.quality.confidenceNotes ||
      `Analysis mode: ${input.concerns.assessmentModeLabel}. Confidence multiplier: ${Math.round(
        input.quality.confidenceMultiplier * 100,
      )}%.`,
  );

  const limitationParts = [
    ...input.concerns.contextNotes,
    ...input.quality.failureReasons,
    ...input.quality.borderlineReasons,
  ].filter(Boolean);

  const limitationsText = enforceSafeLanguage(
    limitationParts.length > 0
      ? limitationParts.join(' ')
      : 'No major technical limitations were flagged for this clip, but this remains a single-observation summary.',
  );

  const monitoringGuidance = enforceSafeLanguage(followupGuidance(input.concerns.followupPriority));
  const professionalEvalGuidance = enforceSafeLanguage(
    'Use this packet as structured context for professional review and next-step planning.',
  );

  const caregiverReport: CaregiverReport = {
    id: `cr_${input.assessmentId}`,
    assessmentId: input.assessmentId,
    observationsText: observationText,
    contextSignalText,
    confidenceText,
    limitationsText,
    monitoringGuidance,
    professionalEvalGuidance,
    clinicianQuestions: [
      'Which observed domains should be prioritized at follow-up?',
      'Are additional recordings needed from another angle?',
      'What timeline is appropriate for the next review?',
    ],
    disclaimerText:
      'GAITBRIDGE is a gait concern documentation and communication support tool. It does not diagnose medical conditions and does not replace professional evaluation.',
    reportVersion: REPORT_VERSION,
    createdAt,
  };

  const metricsTable = buildMetricTable(input.features);
  const concernDomains = buildConcernDomains(input.concerns);

  const clinicianPacket: ClinicianPacket = {
    id: `cp_${input.assessmentId}`,
    assessmentId: input.assessmentId,
    profileSummary: {
      nickname: input.nickname,
      ageMonths: input.ageMonths,
      analyzedAt: input.analyzedAt,
      viewLabel: input.concerns.viewLabel,
      assessmentMode: input.concerns.assessmentMode,
    },
    intakeContext: {
      captureView: input.quality.cameraAngle,
      followupPriority: input.concerns.followupPriority,
      analysisResult: input.quality.result,
      caregiverMainConcern: normalizeContextField(input.intakeContext?.caregiverMainConcern),
      symptomDuration: normalizeContextField(input.intakeContext?.symptomDuration),
      fallsFrequency: normalizeContextField(input.intakeContext?.fallsFrequency),
      recentTherapyChanges: normalizeContextField(input.intakeContext?.recentTherapyChanges),
      recentSurgeryInterventionChanges: normalizeContextField(
        input.intakeContext?.recentSurgeryInterventionChanges,
      ),
      assistiveDeviceSupport: normalizeContextField(input.intakeContext?.assistiveDeviceSupport),
      priorDiagnosisOrSpecialistReview: normalizeContextField(
        input.intakeContext?.priorDiagnosisOrSpecialistReview,
      ),
      correctedAge: normalizeContextField(input.intakeContext?.correctedAge),
    },
    qualitySummary: {
      confidenceMultiplierPct: Math.round(input.quality.confidenceMultiplier * 100),
      confidenceNotes: confidenceText,
      suppressedMetrics: input.quality.suppressedMetrics,
      borderlineReasons: input.quality.borderlineReasons,
      failureReasons: input.quality.failureReasons,
    },
    metricsTable,
    concernDomains,
    trendData: null,
    keyFrames: input.trace ? input.trace.stepEvents.slice(0, 6).map((e) => `frame_${e.frameIndex}`) : null,
    structuredNotes: enforceSafeLanguage(
      [
        `Overall concern level: ${input.concerns.overallLevel}.`,
        `Assessed domains: ${input.concerns.assessedDomains.join(', ') || 'none'}.`,
        `Suppressed domains: ${input.concerns.suppressedDomains.join(', ') || 'none'}.`,
        `Confidence context: ${confidenceText}`,
      ].join(' '),
    ),
    reportVersion: REPORT_VERSION,
    pdfStoragePath: null,
    createdAt,
  };

  const handoffText = enforceSafeLanguage(buildHandoffText(input.nickname, caregiverReport, clinicianPacket));

  return {
    caregiverReport,
    clinicianPacket,
    handoffText,
  };
}
