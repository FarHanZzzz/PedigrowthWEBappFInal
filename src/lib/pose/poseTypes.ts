// PEDI-GROWTH — Pose Landmark Constants
// MediaPipe Pose Landmarker indices for the 33-point body model.
// Source: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker

export const POSE = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

/** Minimum landmark visibility to consider a detection usable */
export const MIN_VISIBILITY = 0.5;

/** Lower-body landmarks critical for gait analysis */
export const GAIT_LANDMARKS = [
  POSE.LEFT_HIP, POSE.RIGHT_HIP,
  POSE.LEFT_KNEE, POSE.RIGHT_KNEE,
  POSE.LEFT_ANKLE, POSE.RIGHT_ANKLE,
  POSE.LEFT_HEEL, POSE.RIGHT_HEEL,
  POSE.LEFT_FOOT_INDEX, POSE.RIGHT_FOOT_INDEX,
] as const;

/** Upper-body landmarks for trunk stability */
export const TRUNK_LANDMARKS = [
  POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER,
  POSE.LEFT_HIP, POSE.RIGHT_HIP,
] as const;

/** All landmarks needed for a complete gait frame */
export const REQUIRED_LANDMARKS = [
  ...GAIT_LANDMARKS,
  ...TRUNK_LANDMARKS,
  POSE.NOSE,
] as const;
