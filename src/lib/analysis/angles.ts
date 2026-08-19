// PEDI-GROWTH — Geometry Utilities
// Pure math functions for joint angle computation.
// No side effects. No dependencies on pose provider.

import type { Landmark } from '@/lib/types';

/**
 * Compute the angle (in degrees) at point B, formed by points A-B-C.
 * Uses the dot-product method in 2D (x,y plane).
 *
 * Example: computeAngle(hip, knee, ankle) gives the knee flexion angle.
 */
export function computeAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const baX = a.x - b.x;
  const baY = a.y - b.y;
  const bcX = c.x - b.x;
  const bcY = c.y - b.y;

  const dot = baX * bcX + baY * bcY;
  const magBA = Math.sqrt(baX * baX + baY * baY);
  const magBC = Math.sqrt(bcX * bcX + bcY * bcY);

  if (magBA === 0 || magBC === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

/**
 * Compute the angle (in degrees) at point B using 3D coordinates.
 * Falls back to 2D if z values are all zero.
 */
export function computeAngle3D(a: Landmark, b: Landmark, c: Landmark): number {
  const baX = a.x - b.x;
  const baY = a.y - b.y;
  const baZ = a.z - b.z;
  const bcX = c.x - b.x;
  const bcY = c.y - b.y;
  const bcZ = c.z - b.z;

  const dot = baX * bcX + baY * bcY + baZ * bcZ;
  const magBA = Math.sqrt(baX * baX + baY * baY + baZ * baZ);
  const magBC = Math.sqrt(bcX * bcX + bcY * bcY + bcZ * bcZ);

  if (magBA === 0 || magBC === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

/**
 * Compute midpoint between two landmarks.
 */
export function midpoint(a: Landmark, b: Landmark): { x: number; y: number; z: number } {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

/**
 * Compute Euclidean distance between two landmarks (2D).
 */
export function distance2D(a: Landmark, b: Landmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Compute the trunk lean angle: deviation of the shoulder-midpoint
 * from directly above the hip-midpoint.
 *
 * Returns degrees from vertical. 0 = perfectly upright.
 * Positive = leaning forward, negative = leaning backward.
 */
export function computeTrunkLean(
  leftShoulder: Landmark,
  rightShoulder: Landmark,
  leftHip: Landmark,
  rightHip: Landmark,
): number {
  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);

  const dx = shoulderMid.x - hipMid.x;
  const dy = shoulderMid.y - hipMid.y;

  // atan2 gives angle from vertical (Y axis)
  // In screen coordinates, Y increases downward, so we invert
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/**
 * Compute the lateral (side-to-side) offset of shoulder-midpoint
 * relative to hip-midpoint. Used for frontal trunk sway.
 *
 * Returns the signed X offset (positive = leaning right).
 * In normalized MediaPipe coordinates (0-1 screen range).
 */
export function computeLateralOffset(
  leftShoulder: Landmark,
  rightShoulder: Landmark,
  leftHip: Landmark,
  rightHip: Landmark,
): number {
  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);
  return shoulderMid.x - hipMid.x;
}

/**
 * Compute left-right hip height difference.
 * In frontal view, unequal hip Y-positions indicate pelvic drop / asymmetry.
 *
 * Returns abs Y-difference in normalized coordinates.
 */
export function computeHipHeightDiff(leftHip: Landmark, rightHip: Landmark): number {
  return Math.abs(leftHip.y - rightHip.y);
}

/**
 * Compute shoulder tilt: absolute Y-difference between shoulders.
 * In frontal view, unequal shoulder height can indicate trunk asymmetry.
 */
export function computeShoulderTilt(leftShoulder: Landmark, rightShoulder: Landmark): number {
  return Math.abs(leftShoulder.y - rightShoulder.y);
}

