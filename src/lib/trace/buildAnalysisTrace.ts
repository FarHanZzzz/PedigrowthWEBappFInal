// PEDI-GROWTH — Build Analysis Trace
// Converts raw pipeline data into the single AnalysisTrace object.
// This is called ONCE after the pipeline completes.
// Every UI component reads from this trace — no duplicated logic.

import type { LandmarkFrame } from '@/lib/types';
import type { VideoQualityAssessment } from '@/lib/quality/qualityTypes';
import type { FootStrike, GaitCycle } from '@/lib/analysis/cycleDetection';
import { POSE, MIN_VISIBILITY } from '@/lib/pose/poseTypes';
import { midpoint, computeHipHeightDiff, computeShoulderTilt, computeLateralOffset } from '@/lib/analysis/angles';
import type { RunProvenance } from '@/lib/session/runProvenance';
import { classifyWalkingDirection } from '@/lib/analysis/directionClassifier';

import type {
  AnalysisTrace,
  FrameTrace,
  StepEvent,
  GaitCycleTrace,
  MetricSource,
  SuppressedMetricEntry,
  PipelineSummary,
  TracePoint,
  TraceLandmark,
  TraceRunMeta,
} from './traceTypes';

// Key landmarks to store in trace (13 of 33 — enough for overlay)
const KEY_LANDMARK_INDICES = [
  POSE.NOSE,
  POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER,
  POSE.LEFT_HIP, POSE.RIGHT_HIP,
  POSE.LEFT_KNEE, POSE.RIGHT_KNEE,
  POSE.LEFT_ANKLE, POSE.RIGHT_ANKLE,
  POSE.LEFT_HEEL, POSE.RIGHT_HEEL,
  POSE.LEFT_FOOT_INDEX, POSE.RIGHT_FOOT_INDEX,
];

const LANDMARK_NAMES: Record<number, string> = {
  [POSE.NOSE]: 'nose',
  [POSE.LEFT_SHOULDER]: 'leftShoulder',
  [POSE.RIGHT_SHOULDER]: 'rightShoulder',
  [POSE.LEFT_HIP]: 'leftHip',
  [POSE.RIGHT_HIP]: 'rightHip',
  [POSE.LEFT_KNEE]: 'leftKnee',
  [POSE.RIGHT_KNEE]: 'rightKnee',
  [POSE.LEFT_ANKLE]: 'leftAnkle',
  [POSE.RIGHT_ANKLE]: 'rightAnkle',
  [POSE.LEFT_HEEL]: 'leftHeel',
  [POSE.RIGHT_HEEL]: 'rightHeel',
  [POSE.LEFT_FOOT_INDEX]: 'leftFoot',
  [POSE.RIGHT_FOOT_INDEX]: 'rightFoot',
};

interface BuildTraceInput {
  sessionId: string;
  frames: LandmarkFrame[];
  footStrikes: FootStrike[];
  gaitCycles: GaitCycle[];
  quality: VideoQualityAssessment;
  videoWidth: number;
  videoHeight: number;
  videoDurationMs: number;
  fps: number;
  metricResults: MetricTraceInput[];
  suppressedResults: SuppressedMetricEntry[];
  provenance: RunProvenance;
}

export interface MetricTraceInput {
  metricName: string;
  displayName: string;
  inputSignal: string;
  computationMethod: string;
  usedFrameIndices: number[];
  rawValues: number[];
  finalValue: number;
  confidence: number;
  unit?: string;
}

export function buildAnalysisTrace(input: BuildTraceInput): AnalysisTrace {
  const {
    sessionId,
    frames,
    footStrikes,
    gaitCycles,
    quality,
    videoWidth,
    videoHeight,
    videoDurationMs,
    fps,
    metricResults,
    suppressedResults,
    provenance,
  } = input;

  // ── Build per-frame trace ──
  const frameTraces: FrameTrace[] = frames.map((frame, idx) => {
    const lms = frame.landmarks;

    // Key landmarks for overlay
    const traceLandmarks: TraceLandmark[] = KEY_LANDMARK_INDICES.map(lmIdx => {
      const lm = lms[lmIdx];
      return {
        name: LANDMARK_NAMES[lmIdx] || `lm_${lmIdx}`,
        x: lm?.x ?? 0,
        y: lm?.y ?? 0,
        z: lm?.z ?? 0,
        visibility: lm?.visibility ?? 0,
      };
    });

    // Body visibility: mean visibility of key landmarks
    const visibilities = traceLandmarks.map(l => l.visibility);
    const bodyVisibility = visibilities.length > 0
      ? visibilities.reduce((a, b) => a + b, 0) / visibilities.length
      : 0;

    const isUsable = bodyVisibility >= 0.3;

    // Derived points
    const lHip = lms[POSE.LEFT_HIP];
    const rHip = lms[POSE.RIGHT_HIP];
    const lShoulder = lms[POSE.LEFT_SHOULDER];
    const rShoulder = lms[POSE.RIGHT_SHOULDER];
    const lAnkle = lms[POSE.LEFT_ANKLE];
    const rAnkle = lms[POSE.RIGHT_ANKLE];
    const lKnee = lms[POSE.LEFT_KNEE];
    const rKnee = lms[POSE.RIGHT_KNEE];
    const lHeel = lms[POSE.LEFT_HEEL];
    const rHeel = lms[POSE.RIGHT_HEEL];

    const hipsVisible = lHip?.visibility >= MIN_VISIBILITY && rHip?.visibility >= MIN_VISIBILITY;
    const shouldersVisible = lShoulder?.visibility >= MIN_VISIBILITY && rShoulder?.visibility >= MIN_VISIBILITY;

    let hipMidpoint: TracePoint | undefined;
    let shoulderMidpoint: TracePoint | undefined;
    let hipTiltDeg: number | undefined;
    let shoulderTiltDeg: number | undefined;
    let lateralOffset: number | undefined;

    if (hipsVisible) {
      const mid = midpoint(lHip, rHip);
      hipMidpoint = { x: mid.x, y: mid.y };
      hipTiltDeg = computeHipHeightDiff(lHip, rHip) * 1000; // amplify for display
    }
    if (shouldersVisible) {
      const mid = midpoint(lShoulder, rShoulder);
      shoulderMidpoint = { x: mid.x, y: mid.y };
      shoulderTiltDeg = computeShoulderTilt(lShoulder, rShoulder) * 1000;
    }
    if (hipsVisible && shouldersVisible) {
      lateralOffset = computeLateralOffset(lShoulder, rShoulder, lHip, rHip);
    }

    const toPoint = (lm: { x: number; y: number; visibility: number } | undefined): TracePoint | undefined => {
      if (!lm || lm.visibility < MIN_VISIBILITY) return undefined;
      return { x: lm.x, y: lm.y };
    };

    return {
      frameIndex: idx,
      timestampMs: frame.timestampMs,
      isUsable,
      suppressionReason: isUsable ? undefined : 'Low landmark visibility',
      bodyVisibility,
      landmarks: traceLandmarks,
      hipMidpoint,
      shoulderMidpoint,
      hipTiltDeg,
      shoulderTiltDeg,
      lateralOffset,
      leftAnkle: toPoint(lAnkle),
      rightAnkle: toPoint(rAnkle),
      leftHip: toPoint(lHip),
      rightHip: toPoint(rHip),
      leftShoulder: toPoint(lShoulder),
      rightShoulder: toPoint(rShoulder),
      leftKnee: toPoint(lKnee),
      rightKnee: toPoint(rKnee),
      leftHeel: toPoint(lHeel),
      rightHeel: toPoint(rHeel),
    };
  });

  // ── Step events ──
  const stepEvents: StepEvent[] = footStrikes.map(strike => ({
    frameIndex: strike.frameIndex,
    timestampMs: strike.timestampMs,
    side: strike.side,
    confidence: 0.7, // Prominence-based detection — moderate confidence
    ankleY: strike.ankleY,
  }));

  // ── Gait cycles ──
  const gaitCycleTraces: GaitCycleTrace[] = gaitCycles.map(cycle => ({
    startFrame: cycle.startStrike.frameIndex,
    endFrame: cycle.endStrike.frameIndex,
    startTimeMs: cycle.startStrike.timestampMs,
    endTimeMs: cycle.endStrike.timestampMs,
    durationMs: cycle.durationMs,
    side: cycle.side,
  }));

  // ── Metric sources ──
  const metricSources: Record<string, MetricSource> = {};
  for (const m of metricResults) {
    metricSources[m.metricName] = {
      metricName: m.metricName,
      displayName: m.displayName,
      inputSignal: m.inputSignal,
      computationMethod: m.computationMethod,
      usedFrameIndices: m.usedFrameIndices,
      frameCount: m.usedFrameIndices.length,
      rawValues: m.rawValues,
      finalValue: m.finalValue,
      confidence: m.confidence,
      unit: m.unit,
    };
  }

  // ── Pipeline summary ──
  const usableFrames = frameTraces.filter(f => f.isUsable).length;
  const leftSteps = stepEvents.filter(s => s.side === 'left').length;
  const rightSteps = stepEvents.filter(s => s.side === 'right').length;

  // L/R tracking stability: did we get roughly balanced L/R steps?
  const lrTrackingStable = leftSteps > 0 && rightSteps > 0 &&
    Math.min(leftSteps, rightSteps) / Math.max(leftSteps, rightSteps) > 0.4;

  const pipeline: PipelineSummary = {
    totalFrames: frames.length,
    usableFrames,
    usableFramePct: frames.length > 0 ? usableFrames / frames.length : 0,
    detectedSteps: stepEvents.length,
    leftSteps,
    rightSteps,
    lrTrackingStable,
    direction: classifyWalkingDirection(frames),
    computedMetrics: metricResults.map(m => m.metricName),
    suppressedMetrics: suppressedResults.map(m => m.metricName),
    assessmentMode: quality.assessmentMode,
    confidenceMultiplier: quality.confidenceMultiplier,
  };

  const run: TraceRunMeta = {
    classification: provenance.classification,
    validationMode: provenance.validationMode,
    sourceClipId: provenance.sourceClipId,
    sourceClipFilename: provenance.sourceClipFilename,
    approvedForDemo: provenance.approvedForDemo,
    modelId: provenance.modelId,
    modelLabel: provenance.modelLabel,
    failureStage: provenance.failureStage,
    failureReason: provenance.failureReason,
    bakeoffReportPath: provenance.bakeoffReportPath,
    exportArtifactPath: provenance.exportArtifactPath,
  };

  return {
    sessionId,
    videoMeta: {
      durationMs: videoDurationMs,
      width: videoWidth,
      height: videoHeight,
      fps,
      totalFrames: frames.length,
    },
    viewType: quality.cameraAngle,
    assessmentMode: quality.assessmentMode,
    run,
    frames: frameTraces,
    stepEvents,
    gaitCycles: gaitCycleTraces,
    metricSources,
    suppressedMetrics: suppressedResults,
    pipeline,
  };
}
