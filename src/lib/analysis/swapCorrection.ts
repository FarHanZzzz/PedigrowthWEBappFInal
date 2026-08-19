// PEDI-GROWTH — L/R Swap Correction (Annotation Quality Recovery)
//
// MediaPipe can swap left/right landmarks frame-to-frame, especially
// on frontal toward/away video when arms cross or the body rotates.
// This module detects and corrects those swaps.
//
// Detection: If the X-position of left and right ankles (or hips/shoulders)
// suddenly crosses between consecutive frames AND the crossing is inconsistent
// with the established order, flag it as a swap.
//
// Correction: Swap the landmarks back to their expected positions.

import type { LandmarkFrame } from '@/lib/types';
import { POSE, MIN_VISIBILITY } from '@/lib/pose/poseTypes';

// Landmark pairs that should maintain consistent L→R ordering
const SWAP_PAIRS = [
  [POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER],
  [POSE.LEFT_HIP, POSE.RIGHT_HIP],
  [POSE.LEFT_KNEE, POSE.RIGHT_KNEE],
  [POSE.LEFT_ANKLE, POSE.RIGHT_ANKLE],
  [POSE.LEFT_HEEL, POSE.RIGHT_HEEL],
  [POSE.LEFT_FOOT_INDEX, POSE.RIGHT_FOOT_INDEX],
  [POSE.LEFT_ELBOW, POSE.RIGHT_ELBOW],
  [POSE.LEFT_WRIST, POSE.RIGHT_WRIST],
];

export interface SwapCorrectionResult {
  frames: LandmarkFrame[];
  swapCount: number;
  swapFrameIndices: number[];
}

/**
 * Detect and correct L/R swaps across a sequence of frames.
 *
 * Strategy:
 * 1. Determine the "expected" L/R order from the first N good frames.
 *    For a person FACING the camera: their left is on OUR right (higher X).
 *    For a person FACING AWAY: their left is on OUR left (lower X).
 * 2. For each subsequent frame, check if the L/R X-order flipped.
 * 3. If it flipped AND visibility is borderline (< 0.65), correct the swap.
 * 4. If it flipped AND visibility is high, it might be a real change
 *    (person turning). In that case, DON'T correct — update the expected order.
 *
 * @param frames — smoothed landmark frames
 * @returns corrected frames + swap statistics
 */
export function correctLRSwaps(frames: LandmarkFrame[]): SwapCorrectionResult {
  if (frames.length < 5) {
    return { frames, swapCount: 0, swapFrameIndices: [] };
  }

  const result = frames.map(f => ({
    ...f,
    landmarks: f.landmarks.map(lm => ({ ...lm })),
  }));

  // Determine expected L/R order from the first 5 good frames
  const expectedOrder = determineExpectedOrder(frames);
  if (expectedOrder === null) {
    // Can't determine expected order — skip correction
    return { frames, swapCount: 0, swapFrameIndices: [] };
  }

  const swapFrameIndices: number[] = [];

  for (let i = 1; i < result.length; i++) {
    const frame = result[i];
    const isSwapped = detectSwap(frame, expectedOrder);

    if (isSwapped) {
      // Check if this is a real swap or a tracking error
      const avgVis = getAvgPairVisibility(frame);

      if (avgVis < 0.65) {
        // Low confidence — this is likely a tracking error. Correct it.
        applySwapCorrection(frame);
        swapFrameIndices.push(i);
      }
      // If high visibility, it might be a real body rotation — don't correct
    }
  }

  return {
    frames: result,
    swapCount: swapFrameIndices.length,
    swapFrameIndices,
  };
}

type ExpectedOrder = 'leftHigherX' | 'leftLowerX';

/**
 * Determine the expected X-order of left vs right landmarks
 * from the first several frames with good visibility.
 */
function determineExpectedOrder(frames: LandmarkFrame[]): ExpectedOrder | null {
  let leftHigherCount = 0;
  let leftLowerCount = 0;

  const sampleSize = Math.min(10, frames.length);
  for (let i = 0; i < sampleSize; i++) {
    const lHip = frames[i].landmarks[POSE.LEFT_HIP];
    const rHip = frames[i].landmarks[POSE.RIGHT_HIP];

    if (lHip.visibility >= MIN_VISIBILITY && rHip.visibility >= MIN_VISIBILITY) {
      if (lHip.x > rHip.x) leftHigherCount++;
      else leftLowerCount++;
    }
  }

  if (leftHigherCount > leftLowerCount && leftHigherCount >= 3) return 'leftHigherX';
  if (leftLowerCount > leftHigherCount && leftLowerCount >= 3) return 'leftLowerX';
  return null; // Inconclusive
}

/**
 * Check if the current frame's L/R order is swapped relative to expected.
 */
function detectSwap(frame: LandmarkFrame, expectedOrder: ExpectedOrder): boolean {
  const lHip = frame.landmarks[POSE.LEFT_HIP];
  const rHip = frame.landmarks[POSE.RIGHT_HIP];

  if (lHip.visibility < 0.3 || rHip.visibility < 0.3) return false;

  const currentIsLeftHigher = lHip.x > rHip.x;

  if (expectedOrder === 'leftHigherX' && !currentIsLeftHigher) return true;
  if (expectedOrder === 'leftLowerX' && currentIsLeftHigher) return true;

  return false;
}

/**
 * Get average visibility of L/R landmark pairs.
 */
function getAvgPairVisibility(frame: LandmarkFrame): number {
  let total = 0;
  let count = 0;

  for (const [leftIdx, rightIdx] of SWAP_PAIRS) {
    const lv = frame.landmarks[leftIdx]?.visibility ?? 0;
    const rv = frame.landmarks[rightIdx]?.visibility ?? 0;
    if (lv > 0.1 || rv > 0.1) {
      total += (lv + rv) / 2;
      count++;
    }
  }

  return count > 0 ? total / count : 0;
}

/**
 * Swap all L/R landmark pairs in a frame.
 */
function applySwapCorrection(frame: LandmarkFrame): void {
  for (const [leftIdx, rightIdx] of SWAP_PAIRS) {
    const temp = { ...frame.landmarks[leftIdx] };
    frame.landmarks[leftIdx] = {
      ...frame.landmarks[rightIdx],
      name: frame.landmarks[leftIdx].name, // Keep the name correct
    };
    frame.landmarks[rightIdx] = {
      ...temp,
      name: frame.landmarks[rightIdx].name,
    };
  }
}
