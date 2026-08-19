// PEDI-GROWTH — Analysis Session Orchestrator (Evidence-First)
//
// DESIGN PRINCIPLES:
// 1. NEVER refuse analysis for merely imperfect home videos (graceful degradation)
// 2. ALWAYS build an AnalysisTrace — the evidence chain consumed by all UI
// 3. RETAIN video for annotated preview (auto-cleanup after 24h)
//
// Three modes:
//   full_assessment  → standard analysis, full confidence
//   best_effort      → reduced confidence, fragile metrics suppressed
//   cannot_assess    → no analysis possible, explain why, offer retry

import { createPoseProvider, extractLandmarkSequence } from '@/lib/pose';
import { assessVideoQuality } from '@/lib/quality/assessVideoQuality';
import { smoothLandmarks } from '@/lib/analysis/smoothing';
import { correctLRSwaps } from '@/lib/analysis/swapCorrection';
import { extractGaitFeatures } from '@/lib/analysis/extractGaitFeatures';
import { validateGaitResults } from '@/lib/analysis/validateResults';
import { detectFootStrikes, buildGaitCycles } from '@/lib/analysis/cycleDetection';
import { computeConcernProfile, type ComputedConcernResult } from '@/lib/scoring/computeConcernProfile';
import {
  checkPipelineHealth,
  predictFromLandmarks,
  type LandmarkFrame as BackendLandmarkFrame,
  type XGBoostPrediction,
} from '@/lib/api/gaitPredictClient';
import { POSE } from '@/lib/pose/poseTypes';
import { getVideo, deleteVideo } from './videoStore';
import { buildAnalysisTrace } from '@/lib/trace/buildAnalysisTrace';
import type { MetricTraceInput } from '@/lib/trace/buildAnalysisTrace';
import type { AnalysisTrace, SuppressedMetricEntry } from '@/lib/trace/traceTypes';
import type { AssessmentMode, CaregiverReport, ClinicianPacket, LandmarkFrame } from '@/lib/types';
import type { VideoQualityAssessment } from '@/lib/quality/qualityTypes';
import {
  buildRunProvenance,
  type PoseModelId,
  type RunProvenance,
  type RunSourceType,
} from './runProvenance';
import { shouldAdoptRecoveryPass, shouldRunRecoveryPass } from './trackingRecovery';
import { buildReportBundle } from '@/lib/reports';

export type PipelineStage =
  | 'loading_video'
  | 'initializing_pose'
  | 'checking_quality'
  | 'extracting_landmarks'
  | 'computing_features'
  | 'scoring_concerns'
  | 'generating_results'
  | 'complete'
  | 'failed';

export interface PipelineProgress {
  stage: PipelineStage;
  stageIndex: number;
  totalStages: number;
  stageProgress: number;
  message: string;
}

export interface ClinicianIntakeContext {
  caregiverMainConcern?: string | null;
  symptomDuration?: string | null;
  fallsFrequency?: string | null;
  recentTherapyChanges?: string | null;
  recentSurgeryInterventionChanges?: string | null;
  assistiveDeviceSupport?: string | null;
  priorDiagnosisOrSpecialistReview?: string | null;
  correctedAge?: string | null;
}

export interface ClinicianFeedbackPayload {
  note: string;
  updatedAt: string;
  visibility: 'parent_and_clinician';
  source?: string;
}

export interface AnalysisSessionResult {
  id: string;
  session: { nickname: string; ageMonths: number; intakeContext?: ClinicianIntakeContext };
  run: RunProvenance;
  assessmentMode: AssessmentMode;
  quality: {
    result: string;
    assessmentMode: AssessmentMode;
    bodyVisibility: number;
    cameraAngle: string;
    frameUsability: number;
    durationSeconds: number;
    confidenceMultiplier: number;
    usableMetrics: string[];
    suppressedMetrics: string[];
    failureReasons: string[];
    borderlineReasons: string[];
    retakeInstructions: string | null;
    retakeSuggestions: string[];
    confidenceNotes: string;
  };
  features: {
    cadence: MetricValue;
    stepSymmetry: MetricValue;
    frontalAsymmetry: MetricValue;
    strideRegularity: MetricValue;
    lateralTrunkSway: MetricValue;
    pathDeviation: MetricValue;
    baseOfSupport: MetricValue;
  };
  concerns: {
    asymmetry: string;
    irregularRhythm: string;
    lateralInstability: string;
    pathDeviation: string;
    overallLevel: string;
    followupPriority: string;
    isLimited: boolean;
    contextNotes: string[];
    suppressedDomains: string[];
    assessedDomains: string[];
    qualityWarning: boolean;
    viewLabel: string;
    assessmentModeLabel: string;
    assessmentMode: AssessmentMode;
  };
  viewType: string;
  isDemo: boolean;
  demoScenario?: string;
  policyVersion: string;
  analyzedAt: string;
  // ── NEW: Evidence chain ──
  trace?: AnalysisTrace;
  reports?: {
    caregiver: CaregiverReport;
    clinician: ClinicianPacket;
    handoffText: string;
  };
  trackingTelemetry?: TrackingTelemetry;
  backendInference?: BackendInference;
  inferenceDecision?: InferenceDecision;
  videoUrl?: string;
  clinicianFeedback?: ClinicianFeedbackPayload;
}

export interface RunAnalysisOptions {
  validationMode?: boolean;
  sourceType?: RunSourceType;
  sourceClipId?: string | null;
  sourceClipFilename?: string | null;
  approvedForDemo?: boolean | null;
  intakeContext?: ClinicianIntakeContext;
}

interface MetricValue {
  value: number;
  confidence: number;
  unit?: string;
  limitedReason?: string;
  suppressed?: boolean;
}

interface TrackingTelemetry {
  sampledFps: number;
  totalFrames: number;
  detectedFrames: number;
  detectionRate: number;
  visibleJointRatio: number;
  temporalStabilityScore: number;
  droppedFrameRatio: number;
  cameraMotionScore: number;
  processingLatencyMs: number;
}

interface BackendInference {
  attempted: boolean;
  available: boolean;
  error: string | null;
  predictions: XGBoostPrediction['predictions'] | null;
}

interface InferenceDecision {
  source: 'hybrid' | 'client_only';
  fusionPolicy: string;
  fallbackReason: string | null;
  modelVersion: string | null;
  backendAvailable: boolean;
  clientConcernProbability: number;
  backendCompositeProbability: number | null;
  fusedCompositeProbability: number;
  confidenceBand: 'low' | 'watch' | 'elevated' | 'high';
}

const STAGES: { stage: PipelineStage; message: string }[] = [
  { stage: 'loading_video', message: 'Loading video...' },
  { stage: 'initializing_pose', message: 'Initializing pose detection...' },
  { stage: 'checking_quality', message: 'Checking video quality...' },
  { stage: 'extracting_landmarks', message: 'Detecting body landmarks...' },
  { stage: 'computing_features', message: 'Extracting gait features...' },
  { stage: 'scoring_concerns', message: 'Computing concern profile...' },
  { stage: 'generating_results', message: 'Building evidence trace...' },
];

// Metric display names for evidence UI
const METRIC_DISPLAY_NAMES: Record<string, string> = {
  cadence: 'Cadence',
  stepSymmetry: 'Step timing symmetry',
  frontalAsymmetry: 'Frontal asymmetry',
  strideRegularity: 'Stride regularity',
  lateralTrunkSway: 'Lateral trunk sway',
  pathDeviation: 'Path deviation',
  baseOfSupport: 'Base of support',
};

const METRIC_INPUT_SIGNALS: Record<string, string> = {
  cadence: 'Ankle-Y oscillation frequency (foot strikes per minute)',
  stepSymmetry: 'Ratio of mean left-step to mean right-step duration',
  frontalAsymmetry: 'Hip height difference and shoulder tilt between L/R sides',
  strideRegularity: 'Coefficient of variation of step intervals',
  lateralTrunkSway: 'Standard deviation of lateral shoulder-hip offset',
  pathDeviation: 'Residual deviation from linear hip-center trajectory',
  baseOfSupport: 'Mean lateral distance between L/R ankles',
};

const METRIC_COMPUTATION_METHODS: Record<string, string> = {
  cadence: 'Count foot strikes ÷ video duration in minutes',
  stepSymmetry: 'min(leftMean, rightMean) / max(leftMean, rightMean)',
  frontalAsymmetry: 'Weighted average of hip height score (60%) and shoulder tilt score (40%)',
  strideRegularity: 'sqrt(variance(intervals)) / mean(intervals)',
  lateralTrunkSway: 'sqrt(variance(lateralOffsets)) normalized to 0-1 scale',
  pathDeviation: 'Linear regression residual SD of hip-center X over time',
  baseOfSupport: 'Mean absolute X-distance between left and right ankles',
};

export async function runAnalysisPipeline(
  sessionId: string,
  nickname: string,
  ageMonths: number,
  onProgress?: (progress: PipelineProgress) => void,
  options: RunAnalysisOptions = {},
): Promise<AnalysisSessionResult> {
  const runStart = performance.now();
  const validationMode = options.validationMode ?? false;
  const modelId: PoseModelId = 'mediapipe_full';
  const modelLabel = 'MediaPipe Full';
  let sampleFps = 10;
  const intakeContext = sanitizeClinicianIntakeContext(options.intakeContext);

  function report(stageIndex: number, stageProgress: number = 0) {
    const s = STAGES[stageIndex];
    onProgress?.({
      stage: s.stage,
      stageIndex,
      totalStages: STAGES.length,
      stageProgress,
      message: s.message,
    });
  }

  try {
    // Stage 0: Load video from IndexedDB
    report(0);
    const videoData = await getVideo(sessionId);
    if (!videoData) {
      return makeValidationFailureResult(
        nickname,
        ageMonths,
        'loading_video',
        'No video was found for this analysis run.',
        options,
      );
    }
    report(0, 1);

    // Stage 1: Initialize pose provider
    report(1);
    let provider;
    try {
      provider = await createPoseProvider('mediapipe');
      await provider.initialize();
    } catch (err) {
      await deleteVideo(sessionId).catch(() => {});
      return makeValidationFailureResult(
        nickname,
        ageMonths,
        'initializing_pose',
        `Pose model initialization failed: ${errorMessage(err)}`,
        options,
        modelId,
        modelLabel,
      );
    }
    report(1, 1);

    try {
      // Stage 2: Quality assessment
      report(2);
      const videoBlob = videoData.blob;
      const { assessment } = await assessVideoQuality(
        provider,
        videoBlob,
        (pct) => report(2, pct),
      );
      report(2, 1);

      // ─── GRACEFUL DEGRADATION: only refuse for cannot_assess ───
      if (assessment.assessmentMode === 'cannot_assess') {
        await deleteVideo(sessionId).catch(() => {});
        return makeCannotAssessResult(
          nickname,
          ageMonths,
          assessment,
          buildRunProvenance({
            classification: 'real_analysis',
            validationMode,
            sourceType: options.sourceType ?? 'upload',
            sourceClipId: options.sourceClipId ?? null,
            sourceClipFilename: options.sourceClipFilename ?? videoData.name,
            approvedForDemo: options.approvedForDemo ?? null,
            modelId,
            modelLabel,
          }),
          intakeContext,
        );
      }

      sampleFps = computeAdaptiveSamplingFps(
        assessment,
        videoData.blob.size,
      );

      // Stage 3: Extract full landmark sequence
      report(3);

      // CRITICAL: Reset MediaPipe's timestamp sequence.
      // Quality assessment used timestamps 0→N. If we start extraction at 0 again,
      // MediaPipe crashes with "Packet timestamp mismatch". This offset ensures
      // all subsequent timestamps are strictly increasing.
      if ('resetTimestampSequence' in provider) {
        (provider as { resetTimestampSequence: () => void }).resetTimestampSequence();
      }

      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';

      const videoURL = URL.createObjectURL(videoBlob);
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error('Video load failed'));
          video.src = videoURL;
        });
        await new Promise<void>((resolve) => {
          if (video.readyState >= 2) { resolve(); return; }
          video.oncanplay = () => resolve();
        });

        let rawFrames = await extractLandmarkSequence(provider, video, sampleFps, (frac) => report(3, frac));

        // Recovery pass for weak detections: retry with a denser/safer sampling profile
        // and keep whichever pass yields the better frame-level detection rate.
        const initialDetectedFrames = countDetectedFrames(rawFrames);
        const initialDetectionRate = rawFrames.length > 0 ? initialDetectedFrames / rawFrames.length : 0;
        const shouldRetryExtraction = shouldRunRecoveryPass(
          initialDetectionRate,
          assessment.frameUsabilityPct,
        );

        if (shouldRetryExtraction) {
          const retryFps = clamp(sampleFps + 2, 10, 20);
          if (retryFps !== sampleFps) {
            if ('resetTimestampSequence' in provider) {
              (provider as { resetTimestampSequence: () => void }).resetTimestampSequence();
            }

            const retryFrames = await extractLandmarkSequence(provider, video, retryFps, (frac) => report(3, frac));
            const retryDetectedFrames = countDetectedFrames(retryFrames);
            const retryDetectionRate = retryFrames.length > 0 ? retryDetectedFrames / retryFrames.length : 0;

            if (shouldAdoptRecoveryPass(initialDetectionRate, retryDetectionRate)) {
              rawFrames = retryFrames;
              sampleFps = retryFps;
            }
          }
        }
        report(3, 1);

        if (rawFrames.length === 0) {
          return makeValidationFailureResult(
            nickname,
            ageMonths,
            'extracting_landmarks',
            'Pose extraction returned an empty landmark sequence.',
            options,
            modelId,
            modelLabel,
          );
        }

        // Stage 4: Smooth + swap correct + compute features
        report(4);
        const smoothingAlpha = computeAdaptiveSmoothingAlpha(assessment);
        const smoothedFrames = smoothLandmarks(rawFrames, smoothingAlpha, {
          frameUsabilityPct: assessment.frameUsabilityPct,
          bodyVisibility: assessment.bodyVisibility,
          cameraMotion: assessment.cameraMotion,
          minAlpha: 0.08,
          maxAlpha: 0.72,
        });
        const { frames: correctedFrames, swapCount } = correctLRSwaps(smoothedFrames);
        if (swapCount > 0) {
          console.log(`[Pedi-Growth] Corrected ${swapCount} L/R swap(s)`);
        }
        const features = extractGaitFeatures(correctedFrames, assessment.cameraAngle);

        const detectedFrames = rawFrames.filter((frame) =>
          frame.landmarks.some((lm) => lm.visibility >= 0.5),
        ).length;
        const visibleJointRatio = correctedFrames.length > 0
          ? correctedFrames
              .map((frame) => {
                const visible = frame.landmarks.filter((lm) => lm.visibility >= 0.5).length;
                return visible / Math.max(frame.landmarks.length, 1);
              })
              .reduce((acc, ratio) => acc + ratio, 0) / correctedFrames.length
          : 0;
        const detectionRate = rawFrames.length > 0 ? detectedFrames / rawFrames.length : 0;
        const temporalStabilityScore = computeTemporalStabilityScore(correctedFrames);

        const trackingTelemetry: TrackingTelemetry = {
          sampledFps: sampleFps,
          totalFrames: rawFrames.length,
          detectedFrames,
          detectionRate,
          visibleJointRatio,
          temporalStabilityScore,
          droppedFrameRatio: 1 - detectionRate,
          cameraMotionScore: assessment.cameraMotion,
          processingLatencyMs: 0,
        };

        const toPair = (frameIndex: number, index: number): [number, number] => {
          const lm = correctedFrames[frameIndex]?.landmarks[index];
          if (!lm || lm.visibility < 0.2) return [0, 0];
          return [lm.x, lm.y];
        };

        const backendFrames: BackendLandmarkFrame[] = correctedFrames.map((_, frameIndex) => ({
          l_hip: toPair(frameIndex, POSE.LEFT_HIP),
          l_knee: toPair(frameIndex, POSE.LEFT_KNEE),
          l_ankle: toPair(frameIndex, POSE.LEFT_ANKLE),
          r_hip: toPair(frameIndex, POSE.RIGHT_HIP),
          r_knee: toPair(frameIndex, POSE.RIGHT_KNEE),
          r_ankle: toPair(frameIndex, POSE.RIGHT_ANKLE),
          l_shoulder: toPair(frameIndex, POSE.LEFT_SHOULDER),
          r_shoulder: toPair(frameIndex, POSE.RIGHT_SHOULDER),
        }));

        let backendInference: BackendInference = {
          attempted: true,
          available: false,
          error: null,
          predictions: null,
        };

        try {
          const backendHealthy = await checkPipelineHealth();
          if (!backendHealthy) {
            backendInference = {
              attempted: true,
              available: false,
              error: 'Pipeline health check failed or backend is unreachable.',
              predictions: null,
            };
          } else {
            const backendResult = await predictFromLandmarks(backendFrames, {
              Age: Math.max(1, Math.round(ageMonths / 12)),
            });

            if (backendResult?.success && backendResult.predictions) {
              backendInference = {
                attempted: true,
                available: true,
                error: null,
                predictions: backendResult.predictions,
              };
            } else if (backendResult?.error) {
              backendInference = {
                attempted: true,
                available: false,
                error: backendResult.error,
                predictions: null,
              };
            }
          }
        } catch (backendErr) {
          backendInference = {
            attempted: true,
            available: false,
            error: errorMessage(backendErr),
            predictions: null,
          };
        }
        report(4, 1);

        // Stage 5: Validate + Score concerns
        report(5);

        // Validate features against physiological bounds and evidence requirements
        const footStrikesForValidation = detectFootStrikes(correctedFrames);
        const validation = validateGaitResults(
          features,
          assessment.durationSeconds,
          correctedFrames.length,
          footStrikesForValidation.length,
        );
        if (validation.warnings.length > 0) {
          console.log('[Pedi-Growth] Validation warnings:', validation.warnings);
        }

        // Use validated features for concern scoring
        const validatedFeatures = validation.adjustedFeatures;
        const concerns = computeConcernProfile(validatedFeatures, assessment);
        const inferenceDecision = computeInferenceDecision(concerns, backendInference);
        report(5, 1);

        // Stage 6: Package result + build evidence trace
        report(6);
        const resultId = 'r_' + Date.now().toString(36);
        const suppressed = new Set(assessment.suppressedMetrics);
        const confMult = assessment.confidenceMultiplier;

        function applySuppress(
          feat: { value: number; confidence: number; unit?: string; limitedReason?: string },
          metricKey: string,
        ): MetricValue {
          if (suppressed.has(metricKey)) {
            return {
              value: feat.value,
              confidence: 0,
              unit: feat.unit,
              limitedReason: 'Not assessed — video quality insufficient for this metric.',
              suppressed: true,
            };
          }
          return {
            value: feat.value,
            confidence: feat.confidence * confMult,
            unit: feat.unit,
            suppressed: false,
          };
        }

        // ── Build Analysis Trace (NON-FATAL — if this fails, result still works) ──
        let trace: AnalysisTrace | undefined;
        const run = buildRunProvenance({
          classification: 'real_analysis',
          validationMode,
          sourceType: options.sourceType ?? 'upload',
          sourceClipId: options.sourceClipId ?? null,
          sourceClipFilename: options.sourceClipFilename ?? videoData.name,
          approvedForDemo: options.approvedForDemo ?? null,
          modelId,
          modelLabel,
        });
        try {
          const footStrikes = detectFootStrikes(correctedFrames);
          const gaitCycles = buildGaitCycles(footStrikes);

          const metricTraceInputs: MetricTraceInput[] = [];
          const suppressedTraceEntries: SuppressedMetricEntry[] = [];

          const metricKeys = Object.keys(METRIC_DISPLAY_NAMES);
          const featureMap: Record<string, { value: number; confidence: number; unit?: string }> = {
            cadence: validatedFeatures.cadenceProxy,
            stepSymmetry: validatedFeatures.stepTimingSymmetry,
            frontalAsymmetry: validatedFeatures.frontalAsymmetry,
            strideRegularity: validatedFeatures.strideRegularity,
            lateralTrunkSway: validatedFeatures.lateralTrunkSway,
            pathDeviation: validatedFeatures.pathDeviation,
            baseOfSupport: validatedFeatures.baseOfSupport,
          };

          for (const key of metricKeys) {
            const feat = featureMap[key];
            if (!feat) continue;

            if (suppressed.has(key)) {
              suppressedTraceEntries.push({
                metricName: key,
                displayName: METRIC_DISPLAY_NAMES[key],
                reason: 'Video quality insufficient for reliable measurement.',
                availableFrames: correctedFrames.filter(f => f.landmarks.some(l => l.visibility >= 0.5)).length,
                requiredFrames: 10,
              });
            } else {
              const usableIndices = correctedFrames
                .map((_, i) => i)
                .filter(i => correctedFrames[i].landmarks.some(l => l.visibility >= 0.5));

              metricTraceInputs.push({
                metricName: key,
                displayName: METRIC_DISPLAY_NAMES[key],
                inputSignal: METRIC_INPUT_SIGNALS[key] || '',
                computationMethod: METRIC_COMPUTATION_METHODS[key] || '',
                usedFrameIndices: usableIndices,
                rawValues: [],
                finalValue: feat.value,
                confidence: feat.confidence * confMult,
                unit: feat.unit,
              });
            }
          }

          trace = buildAnalysisTrace({
            sessionId,
            frames: correctedFrames,
            footStrikes,
            gaitCycles,
            quality: assessment,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            videoDurationMs: video.duration * 1000,
            fps: sampleFps,
            metricResults: metricTraceInputs,
            suppressedResults: suppressedTraceEntries,
            provenance: run,
          });
        } catch (traceErr) {
          console.warn('Trace building failed (non-fatal):', traceErr);
          // Result will still be returned without trace — tabs will show "evidence not available"
        }

        const result: AnalysisSessionResult = {
          id: resultId,
          session: { nickname, ageMonths, intakeContext },
          run,
          assessmentMode: assessment.assessmentMode,
          quality: {
            result: assessment.result,
            assessmentMode: assessment.assessmentMode,
            bodyVisibility: assessment.bodyVisibility,
            cameraAngle: assessment.cameraAngle,
            frameUsability: assessment.frameUsabilityPct,
            durationSeconds: assessment.durationSeconds,
            confidenceMultiplier: assessment.confidenceMultiplier,
            usableMetrics: assessment.usableMetrics,
            suppressedMetrics: assessment.suppressedMetrics,
            failureReasons: assessment.failureReasons,
            borderlineReasons: assessment.borderlineReasons,
            retakeInstructions: assessment.retakeInstructions,
            retakeSuggestions: assessment.retakeSuggestions,
            confidenceNotes: assessment.confidenceNotes,
          },
          features: {
            cadence: applySuppress(validatedFeatures.cadenceProxy, 'cadence'),
            stepSymmetry: applySuppress(validatedFeatures.stepTimingSymmetry, 'stepSymmetry'),
            frontalAsymmetry: applySuppress(validatedFeatures.frontalAsymmetry, 'frontalAsymmetry'),
            strideRegularity: applySuppress(validatedFeatures.strideRegularity, 'strideRegularity'),
            lateralTrunkSway: applySuppress(validatedFeatures.lateralTrunkSway, 'lateralTrunkSway'),
            pathDeviation: applySuppress(validatedFeatures.pathDeviation, 'pathDeviation'),
            baseOfSupport: applySuppress(validatedFeatures.baseOfSupport, 'baseOfSupport'),
          },
          concerns: {
            asymmetry: concerns.asymmetry,
            irregularRhythm: concerns.irregularRhythm,
            lateralInstability: concerns.lateralInstability,
            pathDeviation: concerns.pathDeviation,
            overallLevel: concerns.overallLevel,
            followupPriority: concerns.followupPriority,
            isLimited: concerns.isLimited,
            contextNotes: concerns.contextNotes,
            suppressedDomains: concerns.suppressedDomains,
            assessedDomains: concerns.assessedDomains,
            qualityWarning: concerns.qualityWarning,
            viewLabel: concerns.viewLabel,
            assessmentModeLabel: concerns.assessmentModeLabel,
            assessmentMode: concerns.assessmentMode,
          },
          viewType: features.viewType,
          isDemo: false,
          policyVersion: concerns.policyVersion,
          analyzedAt: new Date().toISOString(),
          trace,
          trackingTelemetry,
          backendInference,
          inferenceDecision,
          // NOTE: No videoUrl here — blob URLs don't survive page navigation.
          // The results page loads video from IndexedDB directly.
        };

        if (result.trackingTelemetry) {
          result.trackingTelemetry.processingLatencyMs = Math.round(performance.now() - runStart);
        }

        report(6, 1);

        // Cleanup video element (but keep blob in IndexedDB for results page)
        URL.revokeObjectURL(videoURL);
        video.remove();

        return withGeneratedReports(result);
      } catch (err) {
        // Cleanup on inner failure
        URL.revokeObjectURL(videoURL);
        video.remove();
        throw err;
      }
    } finally {
      provider.dispose();
      // NOTE: We intentionally do NOT delete the video here anymore.
      // It stays in IndexedDB for the annotated preview.
      // Auto-cleanup happens via retainVideoForReview() timeout (24h).
    }
  } catch (err) {
    console.error('Analysis pipeline failed:', err);
    return makeValidationFailureResult(
      nickname,
      ageMonths,
      'generating_results',
      `Analysis exception: ${errorMessage(err)}`,
      options,
      modelId,
      modelLabel,
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────

const ZERO_METRIC: MetricValue = { value: 0, confidence: 0, limitedReason: 'Assessment not possible', suppressed: true };

function normalizeOptionalContextText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeClinicianIntakeContext(
  context?: ClinicianIntakeContext,
): ClinicianIntakeContext | undefined {
  if (!context) return undefined;

  const normalized: ClinicianIntakeContext = {
    caregiverMainConcern: normalizeOptionalContextText(context.caregiverMainConcern),
    symptomDuration: normalizeOptionalContextText(context.symptomDuration),
    fallsFrequency: normalizeOptionalContextText(context.fallsFrequency),
    recentTherapyChanges: normalizeOptionalContextText(context.recentTherapyChanges),
    recentSurgeryInterventionChanges: normalizeOptionalContextText(context.recentSurgeryInterventionChanges),
    assistiveDeviceSupport: normalizeOptionalContextText(context.assistiveDeviceSupport),
    priorDiagnosisOrSpecialistReview: normalizeOptionalContextText(context.priorDiagnosisOrSpecialistReview),
    correctedAge: normalizeOptionalContextText(context.correctedAge),
  };

  const hasAnyValue = Object.values(normalized).some((value) => typeof value === 'string' && value.length > 0);
  return hasAnyValue ? normalized : undefined;
}

function makeCannotAssessResult(
  nickname: string,
  ageMonths: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assessment: any,
  run: RunProvenance,
  intakeContext?: ClinicianIntakeContext,
): AnalysisSessionResult {
  return withGeneratedReports({
    id: 'r_' + Date.now().toString(36),
    session: { nickname, ageMonths, intakeContext },
    run,
    assessmentMode: 'cannot_assess',
    quality: {
      result: 'fail',
      assessmentMode: 'cannot_assess',
      bodyVisibility: assessment.bodyVisibility,
      cameraAngle: assessment.cameraAngle,
      frameUsability: assessment.frameUsabilityPct,
      durationSeconds: assessment.durationSeconds,
      confidenceMultiplier: 0,
      usableMetrics: [],
      suppressedMetrics: assessment.suppressedMetrics ?? [],
      failureReasons: assessment.failureReasons,
      borderlineReasons: assessment.borderlineReasons,
      retakeInstructions: assessment.retakeInstructions,
      retakeSuggestions: assessment.retakeSuggestions ?? [],
      confidenceNotes: assessment.confidenceNotes,
    },
    features: {
      cadence: { ...ZERO_METRIC, unit: 'steps/min' },
      stepSymmetry: ZERO_METRIC,
      frontalAsymmetry: ZERO_METRIC,
      strideRegularity: ZERO_METRIC,
      lateralTrunkSway: ZERO_METRIC,
      pathDeviation: ZERO_METRIC,
      baseOfSupport: ZERO_METRIC,
    },
    concerns: {
      asymmetry: 'none',
      irregularRhythm: 'none',
      lateralInstability: 'none',
      pathDeviation: 'none',
      overallLevel: 'none',
      followupPriority: 'routine',
      isLimited: true,
      contextNotes: assessment.failureReasons,
      suppressedDomains: ['asymmetry', 'irregularRhythm', 'lateralInstability', 'pathDeviation'],
      assessedDomains: [],
      qualityWarning: true,
      viewLabel: 'Assessment unavailable',
      assessmentModeLabel: 'Assessment unavailable',
      assessmentMode: 'cannot_assess',
    },
    viewType: 'unknown',
    isDemo: false,
    policyVersion: '0.4.0-graceful',
    analyzedAt: new Date().toISOString(),
  });
}

function makeValidationFailureResult(
  nickname: string,
  ageMonths: number,
  stage: PipelineStage,
  reason: string,
  options: RunAnalysisOptions,
  modelId: PoseModelId = 'unknown',
  modelLabel: string = 'Unknown model',
): AnalysisSessionResult {
  const intakeContext = sanitizeClinicianIntakeContext(options.intakeContext);
  const run = buildRunProvenance({
    classification: 'validation_failure',
    validationMode: options.validationMode ?? false,
    sourceType: options.sourceType ?? 'upload',
    sourceClipId: options.sourceClipId ?? null,
    sourceClipFilename: options.sourceClipFilename ?? null,
    approvedForDemo: options.approvedForDemo ?? null,
    modelId,
    modelLabel,
    failureStage: stage,
    failureReason: reason,
  });

  return withGeneratedReports({
    id: 'r_' + Date.now().toString(36),
    session: { nickname, ageMonths, intakeContext },
    run,
    assessmentMode: 'cannot_assess',
    quality: {
      result: 'fail',
      assessmentMode: 'cannot_assess',
      bodyVisibility: 0,
      cameraAngle: 'unknown',
      frameUsability: 0,
      durationSeconds: 0,
      confidenceMultiplier: 0,
      usableMetrics: [],
      suppressedMetrics: Object.keys(METRIC_DISPLAY_NAMES),
      failureReasons: [reason],
      borderlineReasons: [],
      retakeInstructions: 'This run failed before gait analysis could complete. Fix the blocking issue and try again.',
      retakeSuggestions: ['Retry with the approved hero clip after the blocking issue is resolved.'],
      confidenceNotes: 'Validation mode failed loudly. No fallback result was substituted.',
    },
    features: {
      cadence: { ...ZERO_METRIC, unit: 'steps/min' },
      stepSymmetry: ZERO_METRIC,
      frontalAsymmetry: ZERO_METRIC,
      strideRegularity: ZERO_METRIC,
      lateralTrunkSway: ZERO_METRIC,
      pathDeviation: ZERO_METRIC,
      baseOfSupport: ZERO_METRIC,
    },
    concerns: {
      asymmetry: 'none',
      irregularRhythm: 'none',
      lateralInstability: 'none',
      pathDeviation: 'none',
      overallLevel: 'none',
      followupPriority: 'routine',
      isLimited: true,
      contextNotes: [reason],
      suppressedDomains: ['asymmetry', 'irregularRhythm', 'lateralInstability', 'pathDeviation'],
      assessedDomains: [],
      qualityWarning: true,
      viewLabel: 'Validation failure',
      assessmentModeLabel: 'Validation failure',
      assessmentMode: 'cannot_assess',
    },
    viewType: 'unknown',
    isDemo: false,
    policyVersion: '0.4.0-graceful',
    analyzedAt: run.analyzedAt,
  });
}

function withGeneratedReports(result: AnalysisSessionResult): AnalysisSessionResult {
  try {
    const bundle = buildReportBundle({
      assessmentId: result.id,
      nickname: result.session.nickname,
      ageMonths: result.session.ageMonths,
      intakeContext: result.session.intakeContext,
      analyzedAt: result.analyzedAt,
      concerns: {
        asymmetry: result.concerns.asymmetry,
        irregularRhythm: result.concerns.irregularRhythm,
        lateralInstability: result.concerns.lateralInstability,
        pathDeviation: result.concerns.pathDeviation,
        overallLevel: result.concerns.overallLevel,
        followupPriority: result.concerns.followupPriority,
        contextNotes: result.concerns.contextNotes,
        suppressedDomains: result.concerns.suppressedDomains,
        assessedDomains: result.concerns.assessedDomains,
        qualityWarning: result.concerns.qualityWarning,
        viewLabel: result.concerns.viewLabel,
        assessmentModeLabel: result.concerns.assessmentModeLabel,
        assessmentMode: result.concerns.assessmentMode,
      },
      quality: {
        result: result.quality.result,
        cameraAngle: result.quality.cameraAngle,
        confidenceMultiplier: result.quality.confidenceMultiplier,
        confidenceNotes: result.quality.confidenceNotes,
        failureReasons: result.quality.failureReasons,
        borderlineReasons: result.quality.borderlineReasons,
        suppressedMetrics: result.quality.suppressedMetrics,
      },
      features: result.features,
      trace: result.trace,
    });

    return {
      ...result,
      reports: {
        caregiver: bundle.caregiverReport,
        clinician: bundle.clinicianPacket,
        handoffText: bundle.handoffText,
      },
    };
  } catch (error) {
    console.warn('Report generation failed (non-fatal):', error);
    return result;
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error';
}

function computeAdaptiveSamplingFps(
  assessment: VideoQualityAssessment,
  videoBytes: number,
): number {
  const cpuCores = typeof navigator !== 'undefined'
    ? Math.max(1, navigator.hardwareConcurrency || 4)
    : 4;
  const cpuScore = clamp(cpuCores / 8, 0.35, 1);

  const qualityScore = clamp(
    assessment.frameUsabilityPct * 0.6 + assessment.bodyVisibility * 0.4,
    0.2,
    1,
  );

  // Approximate compressed bitrate for coarse complexity scaling.
  const duration = Math.max(assessment.durationSeconds, 1);
  const approxMbps = (videoBytes * 8) / (duration * 1_000_000);
  const decodePenalty = clamp((approxMbps - 5) / 25, 0, 0.35);

  let fps = 15 + Math.round((cpuScore * 0.45 + qualityScore * 0.55) * 15);

  // If we detected too few cycles on a usable video, sample denser.
  if (assessment.detectedGaitCycles < 2 && assessment.frameUsabilityPct >= 0.35) {
    fps += 5;
  }

  // High camera shake reduces effective information gain from very high FPS.
  if (assessment.cameraMotion > 0.65) {
    fps -= 2;
  }

  fps = Math.round(fps * (1 - decodePenalty));
  return clamp(Math.max(15, fps), 15, 30);
}

function computeAdaptiveSmoothingAlpha(assessment: VideoQualityAssessment): number {
  const quality = clamp(assessment.frameUsabilityPct * 0.55 + assessment.bodyVisibility * 0.45, 0.2, 1);
  const motionPenalty = clamp(1 - assessment.cameraMotion * 0.45, 0.6, 1);
  const alpha = (0.2 + quality * 0.24) * motionPenalty;
  return clamp(alpha, 0.12, 0.48);
}

function computeTemporalStabilityScore(frames: LandmarkFrame[]): number {
  if (frames.length < 2) return 0;

  const joints = [
    POSE.LEFT_HIP,
    POSE.RIGHT_HIP,
    POSE.LEFT_KNEE,
    POSE.RIGHT_KNEE,
    POSE.LEFT_ANKLE,
    POSE.RIGHT_ANKLE,
  ];

  let totalDelta = 0;
  let count = 0;

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const curr = frames[i];

    for (const idx of joints) {
      const prevLm = prev.landmarks[idx];
      const currLm = curr.landmarks[idx];
      if (!prevLm || !currLm) continue;
      if (prevLm.visibility < 0.35 || currLm.visibility < 0.35) continue;

      const delta = Math.hypot(currLm.x - prevLm.x, currLm.y - prevLm.y);
      totalDelta += delta;
      count += 1;
    }
  }

  if (count === 0) return 0;
  const avgDelta = totalDelta / count;
  return clamp(1 - avgDelta * 7.5, 0, 1);
}

function countDetectedFrames(frames: LandmarkFrame[]): number {
  return frames.filter((frame) =>
    frame.landmarks.some((lm) => lm.visibility >= 0.5),
  ).length;
}

function computeInferenceDecision(
  concerns: ComputedConcernResult,
  backendInference: BackendInference,
): InferenceDecision {
  const clientConcernProbability = concernLevelToProbability(concerns.overallLevel);
  const backendCompositeProbability = backendInference.predictions?.composite_risk?.probability ?? null;

  if (backendInference.available && backendCompositeProbability !== null) {
    const fusedCompositeProbability = clamp(
      backendCompositeProbability * 0.6 + clientConcernProbability * 0.4,
      0,
      1,
    );

    return {
      source: 'hybrid',
      fusionPolicy: '0.60 backend composite risk + 0.40 client concern proxy',
      fallbackReason: null,
      modelVersion: 'xgb_v1_bundle',
      backendAvailable: true,
      clientConcernProbability,
      backendCompositeProbability,
      fusedCompositeProbability,
      confidenceBand: probabilityToBand(fusedCompositeProbability),
    };
  }

  const fallbackReason =
    backendInference.error ??
    'Backend model inference was unavailable, so confidence bands use client-side concern mapping only.';

  return {
    source: 'client_only',
    fusionPolicy: 'client concern proxy only (backend unavailable)',
    fallbackReason,
    modelVersion: null,
    backendAvailable: false,
    clientConcernProbability,
    backendCompositeProbability: null,
    fusedCompositeProbability: clientConcernProbability,
    confidenceBand: probabilityToBand(clientConcernProbability),
  };
}

// Calibrated probability mapping — based on screening-appropriate confidence levels.
// These values are intentionally moderate because:
// 1. Client-side metrics are computed from normalized MediaPipe coordinates, not calibrated lab equipment
// 2. All concern levels pass through confidence gating, so reaching 'significant' already implies reasonable signal
// 3. Over-confident probabilities would mislead hybrid fusion when backend is available
function concernLevelToProbability(level: string): number {
  switch (level) {
    case 'significant':
      return 0.75;
    case 'moderate':
      return 0.55;
    case 'mild':
      return 0.30;
    case 'none':
    default:
      return 0.10;
  }
}

function probabilityToBand(probability: number): InferenceDecision['confidenceBand'] {
  if (probability >= 0.75) return 'high';
  if (probability >= 0.55) return 'elevated';
  if (probability >= 0.3) return 'watch';
  return 'low';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
