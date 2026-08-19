// PEDI-GROWTH — Analysis Trace Types
// Single source of truth for the evidence chain.
// Consumed by: AnnotatedVideoPlayer, AnalysisTracePanel, KeyFrameGallery,
//              ConcernEvidenceCard, OverlayRenderer, export pipeline.
//
// DESIGN PRINCIPLE: One trace object per session. Every UI component
// reads from the same trace. No duplicated logic.

import type { CameraAngle, AssessmentMode } from '@/lib/types';
import type { RunClassification, PoseModelId } from '@/lib/session/runProvenance';

// ── Top-level trace ────────────────────────────────────────────

export interface AnalysisTrace {
  sessionId: string;
  videoMeta: VideoTraceMeta;
  viewType: CameraAngle;
  assessmentMode: AssessmentMode;
  run: TraceRunMeta;

  frames: FrameTrace[];
  stepEvents: StepEvent[];
  gaitCycles: GaitCycleTrace[];

  metricSources: Record<string, MetricSource>;
  suppressedMetrics: SuppressedMetricEntry[];

  pipeline: PipelineSummary;
}

// ── Video metadata ─────────────────────────────────────────────

export interface VideoTraceMeta {
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
}

// ── Per-frame trace ────────────────────────────────────────────

export interface FrameTrace {
  frameIndex: number;
  timestampMs: number;

  // Usability
  isUsable: boolean;
  suppressionReason?: string;
  bodyVisibility: number;

  // Key landmarks (only the 13 we need for overlay — not all 33)
  landmarks: TraceLandmark[];

  // Derived per-frame values for overlay rendering
  hipMidpoint?: TracePoint;
  shoulderMidpoint?: TracePoint;
  hipTiltDeg?: number;
  shoulderTiltDeg?: number;
  lateralOffset?: number;
  leftAnkle?: TracePoint;
  rightAnkle?: TracePoint;
  leftHip?: TracePoint;
  rightHip?: TracePoint;
  leftShoulder?: TracePoint;
  rightShoulder?: TracePoint;
  leftKnee?: TracePoint;
  rightKnee?: TracePoint;
  leftHeel?: TracePoint;
  rightHeel?: TracePoint;
}

export interface TraceLandmark {
  name: string;
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface TracePoint {
  x: number;
  y: number;
}

// ── Step events ────────────────────────────────────────────────

export interface StepEvent {
  frameIndex: number;
  timestampMs: number;
  side: 'left' | 'right';
  confidence: number;
  ankleY: number;
}

export interface GaitCycleTrace {
  startFrame: number;
  endFrame: number;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  side: 'left' | 'right';
}

// ── Metric source evidence ─────────────────────────────────────

export interface MetricSource {
  metricName: string;
  displayName: string;
  inputSignal: string;        // e.g. "hip height difference L vs R"
  computationMethod: string;  // e.g. "mean of per-frame hip-Y difference"
  usedFrameIndices: number[];
  frameCount: number;
  rawValues: number[];         // per-frame contributing values
  finalValue: number;
  confidence: number;
  unit?: string;
}

export interface SuppressedMetricEntry {
  metricName: string;
  displayName: string;
  reason: string;
  availableFrames: number;
  requiredFrames: number;
}

// ── Pipeline summary ───────────────────────────────────────────

export interface PipelineSummary {
  totalFrames: number;
  usableFrames: number;
  usableFramePct: number;
  detectedSteps: number;
  leftSteps: number;
  rightSteps: number;
  lrTrackingStable: boolean;
  direction: 'toward' | 'away' | 'mixed' | 'unknown';
  computedMetrics: string[];
  suppressedMetrics: string[];
  assessmentMode: AssessmentMode;
  confidenceMultiplier: number;
}

export interface TraceRunMeta {
  classification: RunClassification;
  validationMode: boolean;
  sourceClipId: string | null;
  sourceClipFilename: string | null;
  approvedForDemo: boolean | null;
  modelId: PoseModelId;
  modelLabel: string;
  failureStage: string | null;
  failureReason: string | null;
  bakeoffReportPath: string | null;
  exportArtifactPath: string | null;
}

// ── Key frames ─────────────────────────────────────────────────

export interface KeyFrameSet {
  firstUsable: KeyFrame | null;
  leftStepFrames: KeyFrame[];
  rightStepFrames: KeyFrame[];
  worstConfidence: KeyFrame | null;
  mostAsymmetric: KeyFrame | null;
}

export interface KeyFrame {
  frameIndex: number;
  timestampMs: number;
  label: string;
  reason: string;
}

// ── Overlay config ─────────────────────────────────────────────

export type OverlayLayer =
  | 'skeleton'
  | 'stepMarkers'
  | 'hipLine'
  | 'shoulderLine'
  | 'bodyMidline'
  | 'ankleTrails'
  | 'pathCorridor'
  | 'confidenceStrip';

export const DEFAULT_OVERLAY_LAYERS: OverlayLayer[] = [
  'skeleton',
  'stepMarkers',
];

export const OVERLAY_LAYER_LABELS: Record<OverlayLayer, string> = {
  skeleton: 'Skeleton',
  stepMarkers: 'Step markers',
  hipLine: 'Hip line',
  shoulderLine: 'Shoulder line',
  bodyMidline: 'Body midline',
  ankleTrails: 'Ankle trails',
  pathCorridor: 'Path corridor',
  confidenceStrip: 'Confidence',
};

// ── Colors ─────────────────────────────────────────────────────

export const TRACE_COLORS = {
  leftSide: '#3B82F6',     // blue
  rightSide: '#EF4444',    // red
  skeleton: 'rgba(255, 255, 255, 0.6)',
  skeletonLowConf: 'rgba(255, 255, 255, 0.25)',
  hipLine: '#FBBF24',      // yellow
  shoulderLine: '#22D3EE', // cyan
  midline: 'rgba(255, 255, 255, 0.4)',
  stepMarkerL: '#3B82F6',
  stepMarkerR: '#EF4444',
  pathCorridor: 'rgba(34, 197, 94, 0.2)',
  qualityGood: '#22C55E',
  qualityMedium: '#F59E0B',
  qualityBad: '#EF4444',
} as const;
