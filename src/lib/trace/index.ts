// PEDI-GROWTH — Trace Module Index
// Re-exports all trace utilities.

export { buildAnalysisTrace } from './buildAnalysisTrace';
export { buildKeyFrames } from './buildKeyFrames';
export { summarizeDetectionPath } from './summarizeDetectionPath';
export type {
  AnalysisTrace,
  FrameTrace,
  StepEvent,
  GaitCycleTrace,
  MetricSource,
  SuppressedMetricEntry,
  PipelineSummary,
  KeyFrameSet,
  KeyFrame,
  OverlayLayer,
  VideoTraceMeta,
  TraceLandmark,
  TracePoint,
} from './traceTypes';
export {
  DEFAULT_OVERLAY_LAYERS,
  OVERLAY_LAYER_LABELS,
  TRACE_COLORS,
} from './traceTypes';
