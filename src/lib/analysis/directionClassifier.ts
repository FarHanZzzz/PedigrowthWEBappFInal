// PEDI-GROWTH — Direction Classifier (Annotation Quality Recovery)
//
// Classifies walking direction: toward camera vs away from camera.
// Uses the hip-center Y trend over time.
//
// In frontal video:
// - Toward camera: subject grows → hip Y moves DOWN in normalized coords
// - Away from camera: subject shrinks → hip Y moves UP
//
// This is used by the step detector to adjust its signal analysis.

import type { LandmarkFrame } from '@/lib/types';
import { POSE, MIN_VISIBILITY } from '@/lib/pose/poseTypes';

export type WalkingDirection = 'toward' | 'away' | 'mixed' | 'unknown';

/**
 * Classify the dominant walking direction from hip-center Y trajectory.
 *
 * Returns 'toward' if the person grows (walks toward camera),
 * 'away' if they shrink (walks away), 'mixed' if direction changes,
 * or 'unknown' if insufficient data.
 */
export function classifyWalkingDirection(frames: LandmarkFrame[]): WalkingDirection {
  const hipYs: number[] = [];

  for (const frame of frames) {
    const lHip = frame.landmarks[POSE.LEFT_HIP];
    const rHip = frame.landmarks[POSE.RIGHT_HIP];

    if (lHip.visibility >= MIN_VISIBILITY && rHip.visibility >= MIN_VISIBILITY) {
      hipYs.push((lHip.y + rHip.y) / 2);
    }
  }

  if (hipYs.length < 5) return 'unknown';

  // Compute linear trend of hip Y
  const n = hipYs.length;
  const sumI = (n * (n - 1)) / 2;
  const sumI2 = (n * (n - 1) * (2 * n - 1)) / 6;
  const sumY = hipYs.reduce((a, b) => a + b, 0);
  const sumIY = hipYs.reduce((a, y, i) => a + i * y, 0);

  const slope = (n * sumIY - sumI * sumY) / (n * sumI2 - sumI * sumI);

  // In normalized coords (0=top, 1=bottom):
  // - Negative slope = hip Y decreasing = person moving UP in frame = walking AWAY
  // - Positive slope = hip Y increasing = person moving DOWN in frame = walking TOWARD
  //
  // Threshold: slope magnitude > 0.001 per frame index to count as directional
  if (Math.abs(slope) < 0.0005) return 'mixed'; // Essentially stationary or lateral
  return slope > 0 ? 'toward' : 'away';
}

/**
 * Compute subject scale (approximate body height in frame) per frame.
 * Useful for understanding perspective changes.
 *
 * Returns shoulder-to-ankle distance in normalized coords for each usable frame.
 */
export function computeSubjectScale(frames: LandmarkFrame[]): (number | null)[] {
  return frames.map(frame => {
    const lShoulder = frame.landmarks[POSE.LEFT_SHOULDER];
    const rShoulder = frame.landmarks[POSE.RIGHT_SHOULDER];
    const lAnkle = frame.landmarks[POSE.LEFT_ANKLE];
    const rAnkle = frame.landmarks[POSE.RIGHT_ANKLE];

    const shoulderVisible = lShoulder.visibility >= MIN_VISIBILITY || rShoulder.visibility >= MIN_VISIBILITY;
    const ankleVisible = lAnkle.visibility >= MIN_VISIBILITY || rAnkle.visibility >= MIN_VISIBILITY;

    if (!shoulderVisible || !ankleVisible) return null;

    // Use the best-visible shoulder and ankle
    const shoulderY = lShoulder.visibility >= rShoulder.visibility ? lShoulder.y : rShoulder.y;
    const ankleY = lAnkle.visibility >= rAnkle.visibility ? lAnkle.y : rAnkle.y;

    return Math.abs(ankleY - shoulderY);
  });
}
