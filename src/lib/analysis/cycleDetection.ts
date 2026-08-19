// PEDI-GROWTH — Gait Cycle Detection (v2 — Annotation Quality Recovery)
//
// CHANGES FROM v1:
// 1. Direction-aware frontal step detection using L-R ankle-Y DIFFERENTIAL
//    instead of independent ankle-Y local maxima
// 2. Hip-oscillation fallback for noisy ankle signals
// 3. Minimum inter-step debouncing (200ms)
// 4. Event confidence scoring
// 5. Configurable minimum prominence

import type { LandmarkFrame } from '@/lib/types';
import { POSE, MIN_VISIBILITY } from '@/lib/pose/poseTypes';
import { extractTimeSeries } from './smoothing';

export interface FootStrike {
  frameIndex: number;
  timestampMs: number;
  side: 'left' | 'right';
  ankleY: number;
  confidence: number;
}

export interface GaitCycle {
  startStrike: FootStrike;
  endStrike: FootStrike;
  durationMs: number;
  side: 'left' | 'right';
}

// ══════════════════════════════════════════════════════════════
// MAIN STEP DETECTION — DIRECTION-AWARE
// ══════════════════════════════════════════════════════════════

/**
 * Detect foot strikes from frontal toward/away video.
 *
 * Strategy (v2 — direction-aware):
 * 1. Compute the DIFFERENTIAL signal: leftAnkle.y - rightAnkle.y
 * 2. A positive peak in the differential = left foot is lower = LEFT STEP
 * 3. A negative peak (positive peak of inverted signal) = right foot lower = RIGHT STEP
 * 4. Apply minimum prominence filter and inter-step debounce
 *
 * Fallback: If differential signal is too noisy (low amplitude),
 * fall back to hip-center lateral oscillation detection.
 */
export function detectFootStrikes(
  frames: LandmarkFrame[],
  minProminence: number = 0.008,
): FootStrike[] {
  // Try primary method: L-R ankle-Y differential
  const diffStrikes = detectFromAnkleDifferential(frames, minProminence);

  if (diffStrikes.length >= 4) {
    return diffStrikes; // Good enough signal
  }

  // Fallback: independent ankle-Y maxima (less accurate but more robust)
  const indepStrikes = detectFromIndependentAnkles(frames, minProminence);

  if (indepStrikes.length >= 4) {
    return indepStrikes;
  }

  // Last resort: hip oscillation (most robust but lowest resolution)
  const hipStrikes = detectFromHipOscillation(frames);
  return hipStrikes;
}

// ── Primary: L-R ankle-Y differential ───────────────────────

function detectFromAnkleDifferential(
  frames: LandmarkFrame[],
  minProminence: number,
): FootStrike[] {
  if (frames.length < 10) return [];

  // Build differential signal: leftAnkle.y - rightAnkle.y
  const diffSignal: { value: number; time: number; visibility: number }[] = [];

  for (const frame of frames) {
    const la = frame.landmarks[POSE.LEFT_ANKLE];
    const ra = frame.landmarks[POSE.RIGHT_ANKLE];

    const bothVisible = la.visibility >= 0.3 && ra.visibility >= 0.3;
    diffSignal.push({
      value: bothVisible ? la.y - ra.y : 0,
      time: frame.timestampMs,
      visibility: bothVisible ? Math.min(la.visibility, ra.visibility) : 0,
    });
  }

  const strikes: FootStrike[] = [];
  const MIN_INTERVAL_MS = 200; // Minimum 200ms between steps

  // Find positive peaks = left step (left ankle dips lower)
  const leftPeaks = findLocalMaxima(diffSignal, minProminence);
  for (const idx of leftPeaks) {
    const isDebounced = strikes.some(
      s => Math.abs(s.timestampMs - frames[idx].timestampMs) < MIN_INTERVAL_MS
    );
    if (!isDebounced) {
      strikes.push({
        frameIndex: idx,
        timestampMs: frames[idx].timestampMs,
        side: 'left',
        ankleY: frames[idx].landmarks[POSE.LEFT_ANKLE].y,
        confidence: Math.min(1, diffSignal[idx].visibility * 1.5),
      });
    }
  }

  // Find negative peaks = right step (right ankle dips lower)
  // Invert the signal and find maxima
  const invertedSignal = diffSignal.map(s => ({
    ...s,
    value: -s.value,
  }));
  const rightPeaks = findLocalMaxima(invertedSignal, minProminence);
  for (const idx of rightPeaks) {
    const isDebounced = strikes.some(
      s => Math.abs(s.timestampMs - frames[idx].timestampMs) < MIN_INTERVAL_MS
    );
    if (!isDebounced) {
      strikes.push({
        frameIndex: idx,
        timestampMs: frames[idx].timestampMs,
        side: 'right',
        ankleY: frames[idx].landmarks[POSE.RIGHT_ANKLE].y,
        confidence: Math.min(1, invertedSignal[idx].visibility * 1.5),
      });
    }
  }

  // Sort by timestamp
  return strikes.sort((a, b) => a.timestampMs - b.timestampMs);
}

// ── Fallback: Independent ankle-Y maxima (v1 method) ────────

function detectFromIndependentAnkles(
  frames: LandmarkFrame[],
  minProminence: number,
): FootStrike[] {
  const leftAnkle = extractTimeSeries(frames, POSE.LEFT_ANKLE, 'y');
  const rightAnkle = extractTimeSeries(frames, POSE.RIGHT_ANKLE, 'y');

  const MIN_INTERVAL_MS = 200;

  const leftStrikes = findLocalMaxima(leftAnkle, minProminence).map((idx) => ({
    frameIndex: idx,
    timestampMs: frames[idx].timestampMs,
    side: 'left' as const,
    ankleY: leftAnkle[idx].value,
    confidence: Math.min(0.7, leftAnkle[idx].visibility), // Lower confidence for fallback
  }));

  const rightStrikes = findLocalMaxima(rightAnkle, minProminence).map((idx) => ({
    frameIndex: idx,
    timestampMs: frames[idx].timestampMs,
    side: 'right' as const,
    ankleY: rightAnkle[idx].value,
    confidence: Math.min(0.7, rightAnkle[idx].visibility),
  }));

  // Merge, sort, and debounce
  const all = [...leftStrikes, ...rightStrikes].sort(
    (a, b) => a.timestampMs - b.timestampMs
  );

  const debounced: FootStrike[] = [];
  for (const strike of all) {
    const tooClose = debounced.some(
      s => Math.abs(s.timestampMs - strike.timestampMs) < MIN_INTERVAL_MS
    );
    if (!tooClose) debounced.push(strike);
  }

  return debounced;
}

// ── Last resort: Hip lateral oscillation ─────────────────────

function detectFromHipOscillation(frames: LandmarkFrame[]): FootStrike[] {
  if (frames.length < 10) return [];

  // Track hip-center X oscillation — each zero-crossing = one step
  const hipXSignal: { value: number; time: number; visibility: number }[] = [];
  let meanX = 0;
  let count = 0;

  // First pass: compute mean hip-center X
  for (const frame of frames) {
    const lHip = frame.landmarks[POSE.LEFT_HIP];
    const rHip = frame.landmarks[POSE.RIGHT_HIP];
    if (lHip.visibility >= MIN_VISIBILITY && rHip.visibility >= MIN_VISIBILITY) {
      meanX += (lHip.x + rHip.x) / 2;
      count++;
    }
  }
  if (count < 5) return [];
  meanX /= count;

  // Second pass: build centered signal
  for (const frame of frames) {
    const lHip = frame.landmarks[POSE.LEFT_HIP];
    const rHip = frame.landmarks[POSE.RIGHT_HIP];
    const bothVisible = lHip.visibility >= MIN_VISIBILITY && rHip.visibility >= MIN_VISIBILITY;
    hipXSignal.push({
      value: bothVisible ? (lHip.x + rHip.x) / 2 - meanX : 0,
      time: frame.timestampMs,
      visibility: bothVisible ? Math.min(lHip.visibility, rHip.visibility) : 0,
    });
  }

  // Find zero crossings (sign changes)
  const strikes: FootStrike[] = [];
  for (let i = 1; i < hipXSignal.length; i++) {
    if (hipXSignal[i].visibility < 0.3 || hipXSignal[i - 1].visibility < 0.3) continue;

    const prevSign = Math.sign(hipXSignal[i - 1].value);
    const currSign = Math.sign(hipXSignal[i].value);

    if (prevSign !== currSign && prevSign !== 0 && currSign !== 0) {
      // Zero crossing = step event
      // Positive → negative = rightward shift = left step
      // Negative → positive = leftward shift = right step
      const side: 'left' | 'right' = currSign < 0 ? 'left' : 'right';

      const tooClose = strikes.length > 0 &&
        (frames[i].timestampMs - strikes[strikes.length - 1].timestampMs) < 200;

      if (!tooClose) {
        strikes.push({
          frameIndex: i,
          timestampMs: frames[i].timestampMs,
          side,
          ankleY: 0, // Not available in this method
          confidence: 0.4, // Low confidence for hip-based detection
        });
      }
    }
  }

  return strikes;
}

// ══════════════════════════════════════════════════════════════
// GAIT CYCLE BUILDING & STEP INTERVALS
// ══════════════════════════════════════════════════════════════

/**
 * Group foot strikes into gait cycles.
 * A gait cycle for side X = from one X-strike to the next X-strike.
 */
export function buildGaitCycles(strikes: FootStrike[]): GaitCycle[] {
  const cycles: GaitCycle[] = [];

  const leftStrikes = strikes.filter((s) => s.side === 'left');
  const rightStrikes = strikes.filter((s) => s.side === 'right');

  for (const sideStrikes of [leftStrikes, rightStrikes]) {
    for (let i = 0; i < sideStrikes.length - 1; i++) {
      const start = sideStrikes[i];
      const end = sideStrikes[i + 1];
      const durationMs = end.timestampMs - start.timestampMs;

      // Reject implausibly short or long cycles
      if (durationMs > 200 && durationMs < 3000) {
        cycles.push({
          startStrike: start,
          endStrike: end,
          durationMs,
          side: start.side,
        });
      }
    }
  }

  return cycles.sort((a, b) => a.startStrike.timestampMs - b.startStrike.timestampMs);
}

/**
 * Compute step intervals (time between consecutive foot strikes).
 */
export function computeStepIntervals(strikes: FootStrike[]): {
  intervals: number[];
  leftIntervals: number[];
  rightIntervals: number[];
} {
  const intervals: number[] = [];
  const leftIntervals: number[] = [];
  const rightIntervals: number[] = [];

  for (let i = 1; i < strikes.length; i++) {
    const dt = strikes[i].timestampMs - strikes[i - 1].timestampMs;
    if (dt > 100 && dt < 2000) {
      intervals.push(dt);
      if (strikes[i].side === 'left') {
        leftIntervals.push(dt);
      } else {
        rightIntervals.push(dt);
      }
    }
  }

  return { intervals, leftIntervals, rightIntervals };
}

// ── Internal helpers ────────────────────────────────────────────

/**
 * Find indices of local maxima in a time series.
 * Filters by minimum prominence to reject noise.
 */
function findLocalMaxima(
  series: { value: number; visibility: number }[],
  minProminence: number,
): number[] {
  const maxima: number[] = [];

  for (let i = 1; i < series.length - 1; i++) {
    // Skip low-visibility frames
    if (series[i].visibility < 0.25) continue;

    const prev = series[i - 1].value;
    const curr = series[i].value;
    const next = series[i + 1].value;

    if (curr > prev && curr > next) {
      // Check prominence
      const prominence = curr - Math.max(prev, next);
      if (prominence >= minProminence) {
        maxima.push(i);
      }
    }
  }

  return maxima;
}
