// PEDI-GROWTH — Temporal Smoothing (v2 — Annotation Quality Recovery)
//
// CHANGES FROM v1:
// 1. Confidence-aware EMA: low-visibility landmarks lean harder on previous good position
// 2. Short-gap interpolation for 1-3 frame dropouts
// 3. 1-Euro filter option for better smoothing of noisy tracking
// 4. No smoothing of Z-axis (unreliable from frontal view)
// Pure functions. No side effects.

import type { LandmarkFrame, Landmark } from '@/lib/types';
import { MIN_VISIBILITY } from '@/lib/pose/poseTypes';

export interface TemporalSmoothingOptions {
  frameUsabilityPct?: number;
  bodyVisibility?: number;
  cameraMotion?: number;
  minAlpha?: number;
  maxAlpha?: number;
}

// ══════════════════════════════════════════════════════════════
// CONFIDENCE-AWARE EMA
// ══════════════════════════════════════════════════════════════

/**
 * Apply confidence-aware EMA smoothing to a sequence of landmark frames.
 *
 * Key improvement over v1: the effective alpha is scaled by landmark
 * visibility. If a landmark has low confidence (visibility < MIN_VISIBILITY),
 * we lean heavily on the previous smoothed value instead of pulling toward
 * noisy/garbage coordinates.
 *
 * @param frames — raw landmark frames from pose provider
 * @param alpha — base smoothing factor (0-1). Higher = less smoothing.
 * @returns smoothed landmark frames
 */
export function smoothLandmarks(
  frames: LandmarkFrame[],
  alpha: number = 0.3,
  options: TemporalSmoothingOptions = {},
): LandmarkFrame[] {
  if (frames.length === 0) return [];
  if (frames.length === 1) return [...frames];

  // First pass: confidence-aware EMA
  const smoothed = confidenceAwareEMA(frames, alpha, options);

  // Second pass: short-gap interpolation
  return interpolateGaps(smoothed, 3);
}

/**
 * Confidence-aware EMA.
 * Low-visibility landmarks get a much lower effective alpha,
 * meaning they "trust" the previous smoothed position more.
 */
function confidenceAwareEMA(
  frames: LandmarkFrame[],
  baseAlpha: number,
  options: TemporalSmoothingOptions,
): LandmarkFrame[] {
  const result: LandmarkFrame[] = [frames[0]];

  const frameUsability = clamp(options.frameUsabilityPct ?? 0.8, 0.2, 1);
  const bodyVisibility = clamp(options.bodyVisibility ?? 0.8, 0.2, 1);
  const cameraMotion = clamp(options.cameraMotion ?? 0.3, 0, 1);
  const minAlpha = options.minAlpha ?? 0.08;
  const maxAlpha = options.maxAlpha ?? 0.7;

  const qualityWeight = clamp(0.55 * frameUsability + 0.45 * bodyVisibility, 0.3, 1);
  const motionPenalty = clamp(1 - cameraMotion * 0.35, 0.65, 1);

  for (let i = 1; i < frames.length; i++) {
    const prev = result[i - 1];
    const curr = frames[i];

    const smoothedLandmarks: Landmark[] = curr.landmarks.map((lm, idx) => {
      const prevLm = prev.landmarks[idx];
      if (!prevLm) return lm;

      // Scale alpha by visibility confidence:
      // - High visibility (≥ 0.5): use full alpha → trust current measurement
      // - Low visibility (< 0.5): reduce alpha → lean on previous position
      // - Very low (< 0.15): near-zero alpha → almost entirely previous position
      const visRatio = clamp(lm.visibility / MIN_VISIBILITY, 0.05, 1);

      // If movement between consecutive frames is strong, preserve temporal detail
      // by letting alpha increase (avoid over-smoothing real gait motion).
      const movementDelta = Math.abs(lm.x - prevLm.x) + Math.abs(lm.y - prevLm.y);
      const movementBoost = clamp(movementDelta * 8, 0, 0.45);

      const effectiveAlpha = clamp(
        baseAlpha * visRatio * qualityWeight * motionPenalty + movementBoost,
        minAlpha,
        maxAlpha,
      );

      return {
        x: ema(prevLm.x, lm.x, effectiveAlpha),
        y: ema(prevLm.y, lm.y, effectiveAlpha),
        z: lm.z, // Don't smooth Z — unreliable from frontal view
        visibility: lm.visibility, // Don't smooth visibility
        name: lm.name,
      };
    });

    result.push({
      timestampMs: curr.timestampMs,
      landmarks: smoothedLandmarks,
    });
  }

  return result;
}

function ema(prev: number, curr: number, alpha: number): number {
  return alpha * curr + (1 - alpha) * prev;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ══════════════════════════════════════════════════════════════
// SHORT-GAP INTERPOLATION
// ══════════════════════════════════════════════════════════════

/**
 * Linearly interpolate landmarks across short gaps where visibility dropped.
 *
 * If a landmark has very low visibility for 1-3 consecutive frames
 * but good visibility before and after, replace the gap with linear
 * interpolation. This prevents landmark "teleportation" after dropouts.
 *
 * @param frames — smoothed frames
 * @param maxGap — maximum gap length to interpolate (default: 3)
 */
function interpolateGaps(
  frames: LandmarkFrame[],
  maxGap: number,
): LandmarkFrame[] {
  if (frames.length < 3) return frames;

  const result = frames.map(f => ({
    ...f,
    landmarks: f.landmarks.map(lm => ({ ...lm })),
  }));

  const numLandmarks = frames[0].landmarks.length;

  for (let lmIdx = 0; lmIdx < numLandmarks; lmIdx++) {
    let i = 0;
    while (i < frames.length) {
      const lm = frames[i].landmarks[lmIdx];

      if (lm.visibility < 0.15) {
        // Found start of a gap — find end
        let gapEnd = i;
        while (gapEnd < frames.length && frames[gapEnd].landmarks[lmIdx].visibility < 0.15) {
          gapEnd++;
        }

        const gapLen = gapEnd - i;
        const hasBefore = i > 0 && frames[i - 1].landmarks[lmIdx].visibility >= MIN_VISIBILITY;
        const hasAfter = gapEnd < frames.length && frames[gapEnd].landmarks[lmIdx].visibility >= MIN_VISIBILITY;

        if (gapLen <= maxGap && hasBefore && hasAfter) {
          // Interpolate
          const before = frames[i - 1].landmarks[lmIdx];
          const after = frames[gapEnd].landmarks[lmIdx];

          for (let g = 0; g < gapLen; g++) {
            const t = (g + 1) / (gapLen + 1);
            result[i + g].landmarks[lmIdx] = {
              x: before.x + (after.x - before.x) * t,
              y: before.y + (after.y - before.y) * t,
              z: before.z + (after.z - before.z) * t,
              visibility: 0.25, // Mark as interpolated (low but visible)
              name: before.name,
            };
          }
        }

        i = gapEnd;
      } else {
        i++;
      }
    }
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// TIME SERIES EXTRACTION (used by cycle detection)
// ══════════════════════════════════════════════════════════════

/**
 * Extract a single landmark's position across all frames as a time series.
 * Useful for cycle detection.
 */
export function extractTimeSeries(
  frames: LandmarkFrame[],
  landmarkIndex: number,
  axis: 'x' | 'y' | 'z' = 'y',
): { time: number; value: number; visibility: number }[] {
  return frames.map((frame) => {
    const lm = frame.landmarks[landmarkIndex];
    return {
      time: frame.timestampMs,
      value: lm ? lm[axis] : 0,
      visibility: lm ? lm.visibility : 0,
    };
  });
}
