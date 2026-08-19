// PEDI-GROWTH — Key Frame Extraction
// Identifies important frames for the key frame gallery.
// Reads from AnalysisTrace — no duplicated logic.

import type { AnalysisTrace, KeyFrameSet, KeyFrame } from './traceTypes';

/**
 * Extract key frames from an analysis trace.
 *
 * Key frames:
 * 1. First usable frame — "Here's where we started tracking"
 * 2. Left step frames — "These are the left foot strikes we detected"
 * 3. Right step frames — "These are the right foot strikes we detected"
 * 4. Worst confidence frame — "This was our least reliable frame"
 * 5. Most asymmetric frame — "This frame showed the most asymmetry"
 */
export function buildKeyFrames(trace: AnalysisTrace): KeyFrameSet {
  const { frames, stepEvents } = trace;

  // 1. First usable frame
  const firstUsable = frames.find(f => f.isUsable);
  const firstUsableKF: KeyFrame | null = firstUsable
    ? {
        frameIndex: firstUsable.frameIndex,
        timestampMs: firstUsable.timestampMs,
        label: 'First detection',
        reason: `Body first detected at ${(firstUsable.timestampMs / 1000).toFixed(1)}s with ${Math.round(firstUsable.bodyVisibility * 100)}% visibility`,
      }
    : null;

  // 2. Left step frames
  const leftStepFrames: KeyFrame[] = stepEvents
    .filter(s => s.side === 'left')
    .slice(0, 6) // cap at 6
    .map(s => ({
      frameIndex: s.frameIndex,
      timestampMs: s.timestampMs,
      label: 'L step',
      reason: `Left foot strike at ${(s.timestampMs / 1000).toFixed(2)}s`,
    }));

  // 3. Right step frames
  const rightStepFrames: KeyFrame[] = stepEvents
    .filter(s => s.side === 'right')
    .slice(0, 6)
    .map(s => ({
      frameIndex: s.frameIndex,
      timestampMs: s.timestampMs,
      label: 'R step',
      reason: `Right foot strike at ${(s.timestampMs / 1000).toFixed(2)}s`,
    }));

  // 4. Worst confidence frame (among usable frames)
  const usableFrames = frames.filter(f => f.isUsable);
  let worstConfidence: KeyFrame | null = null;
  if (usableFrames.length > 2) {
    const worst = usableFrames.reduce((min, f) =>
      f.bodyVisibility < min.bodyVisibility ? f : min
    );
    worstConfidence = {
      frameIndex: worst.frameIndex,
      timestampMs: worst.timestampMs,
      label: 'Lowest confidence',
      reason: `Body visibility dropped to ${Math.round(worst.bodyVisibility * 100)}% at ${(worst.timestampMs / 1000).toFixed(1)}s`,
    };
  }

  // 5. Most asymmetric frame (largest hip tilt)
  let mostAsymmetric: KeyFrame | null = null;
  const framesWithTilt = frames.filter(f => f.hipTiltDeg !== undefined && f.isUsable);
  if (framesWithTilt.length > 2) {
    const maxTilt = framesWithTilt.reduce((max, f) =>
      Math.abs(f.hipTiltDeg!) > Math.abs(max.hipTiltDeg!) ? f : max
    );
    if (Math.abs(maxTilt.hipTiltDeg!) > 5) { // Only flag if tilt is noticeable
      mostAsymmetric = {
        frameIndex: maxTilt.frameIndex,
        timestampMs: maxTilt.timestampMs,
        label: 'Most asymmetric',
        reason: `Hip tilt of ${Math.abs(maxTilt.hipTiltDeg!).toFixed(1)}° at ${(maxTilt.timestampMs / 1000).toFixed(1)}s`,
      };
    }
  }

  return {
    firstUsable: firstUsableKF,
    leftStepFrames,
    rightStepFrames,
    worstConfidence,
    mostAsymmetric,
  };
}
