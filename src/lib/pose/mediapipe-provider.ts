// PEDI-GROWTH — MediaPipe Pose Provider (Real Implementation)
// Uses @mediapipe/tasks-vision PoseLandmarker with CDN-loaded WASM & model.
//
// CRITICAL: MediaPipe detectForVideo() requires STRICTLY MONOTONICALLY
// INCREASING timestamps. If timestamps go backwards (e.g. quality assessment
// at 0-7500ms, then full extraction at 0-15000ms), MediaPipe crashes with:
// "Packet timestamp mismatch on stream norm_rect"
//
// Fix: Track the highest timestamp ever sent and offset all subsequent
// calls to ensure monotonic ordering.

import type { PoseProvider, LandmarkFrame, Landmark } from '@/lib/types';

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

// MediaPipe landmark names (33-point model)
const LANDMARK_NAMES = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
  'left_index', 'right_index', 'left_thumb', 'right_thumb',
  'left_hip', 'right_hip', 'left_knee', 'right_knee',
  'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index',
];

/**
 * MediaPipe Pose Landmarker provider.
 * Loads WASM + model from CDN on first initialize().
 * Runs on main thread (Web Worker deferred to Phase 3).
 */
export class MediaPipePoseProvider implements PoseProvider {
  readonly name = 'mediapipe';
  readonly version = '0.10.x';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private landmarker: any = null;

  // Track the highest timestamp ever sent to detectForVideo.
  // MediaPipe requires strictly monotonically increasing timestamps.
  // When we re-process the same video (quality check → full extraction),
  // we offset by this value to avoid timestamp collision.
  private highestTimestampSent: number = 0;
  private timestampOffset: number = 0;

  async initialize(): Promise<void> {
    // Dynamic import to keep bundle small
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');

    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.7,
      minTrackingConfidence: 0.75,
    });
  }

  /**
   * Call this between processing phases (e.g. after quality assessment,
   * before full extraction) to reset timestamp monotonicity.
   * The offset ensures that the next phase's timestamps are always
   * higher than the previous phase's highest timestamp.
   */
  resetTimestampSequence(): void {
    if (this.highestTimestampSent > 0) {
      this.timestampOffset = this.highestTimestampSent + 1000; // 1 second gap
    }
  }

  async extractFrame(
    frame: ImageBitmap | HTMLVideoElement,
    timestampMs?: number,
  ): Promise<LandmarkFrame> {
    if (!this.landmarker) {
      throw new Error('MediaPipePoseProvider not initialized. Call initialize() first.');
    }

    const rawTs = timestampMs ?? performance.now();
    // Apply offset to ensure monotonic timestamps across phases
    const ts = Math.round(rawTs + this.timestampOffset);

    // Ensure strictly increasing — MediaPipe will crash if ts <= previous
    const safeTsMs = Math.max(ts, this.highestTimestampSent + 1);
    this.highestTimestampSent = safeTsMs;

    // detectForVideo returns { landmarks, worldLandmarks, segmentationMasks }
    const result = this.landmarker.detectForVideo(frame, safeTsMs);

    if (!result.landmarks || result.landmarks.length === 0) {
      // No person detected — return empty frame
      return {
        timestampMs: rawTs, // Return the ORIGINAL timestamp for the consumer
        landmarks: LANDMARK_NAMES.map((name) => ({
          x: 0, y: 0, z: 0, visibility: 0, name,
        })),
      };
    }

    // Use the first (and only, since numPoses=1) detection
    const poseLandmarks = result.landmarks[0];
    const worldLandmarks = result.worldLandmarks?.[0];

    const landmarks: Landmark[] = poseLandmarks.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lm: any, idx: number): Landmark => ({
        x: lm.x ?? 0,
        y: lm.y ?? 0,
        z: worldLandmarks?.[idx]?.z ?? lm.z ?? 0,
        visibility: lm.visibility ?? 0,
        name: LANDMARK_NAMES[idx] ?? `landmark_${idx}`,
      })
    );

    return { timestampMs: rawTs, landmarks }; // Return ORIGINAL timestamp
  }

  dispose(): void {
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
  }
}
