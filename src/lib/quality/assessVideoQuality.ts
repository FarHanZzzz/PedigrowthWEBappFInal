// PEDI-GROWTH — Real Video Quality Assessment
// Loads video, samples frames, runs pose detection, evaluates quality.

import type { PoseProvider, LandmarkFrame } from '@/lib/types';
import type { VideoQualityAssessment, FrameQualitySample } from './qualityTypes';
import { evaluateQuality } from '@/lib/policy/quality-thresholds';
import { POSE, MIN_VISIBILITY, GAIT_LANDMARKS } from '@/lib/pose/poseTypes';
import { detectFootStrikes } from '@/lib/analysis/cycleDetection';
import type { CameraAngle } from '@/lib/types';

const QA_SAMPLE_FPS = 2; // Sample at 2fps for quality — faster than full extraction
const MAX_SAMPLE_DURATION = 15; // Only sample first 15 seconds
const SEEK_TIMEOUT_MS = 2500;

/**
 * Run real video quality assessment.
 *
 * Steps:
 * 1. Load video into off-screen <video> element
 * 2. Sample frames at 2fps
 * 3. Run pose detection on each sample
 * 4. Compute quality metrics from pose results
 * 5. Evaluate against thresholds
 *
 * @param provider — initialized PoseProvider
 * @param videoBlob — the video file
 * @param onProgress — progress callback (0-1)
 */
export async function assessVideoQuality(
  provider: PoseProvider,
  videoBlob: Blob,
  onProgress?: (pct: number) => void,
): Promise<{ assessment: VideoQualityAssessment; sampleFrames: LandmarkFrame[] }> {
  // Create off-screen video element
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  const videoURL = URL.createObjectURL(videoBlob);

  try {
    // Load video metadata
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
      video.src = videoURL;
    });

    // Wait for enough data
    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) { resolve(); return; }
      video.oncanplay = () => resolve();
    });

    const duration = Math.min(video.duration, MAX_SAMPLE_DURATION);
    const width = video.videoWidth;
    const height = video.videoHeight;
    const interval = 1 / QA_SAMPLE_FPS;
    const totalSamples = Math.max(1, Math.floor(duration * QA_SAMPLE_FPS));

    const samples: FrameQualitySample[] = [];
    const sampleFrames: LandmarkFrame[] = [];

    // Sample frames
    for (let i = 0; i < totalSamples; i++) {
      const time = i * interval;

      // Seek to time with timeout fallback so one bad seek doesn't hang the pipeline.
      await seekVideo(video, time, SEEK_TIMEOUT_MS);

      // Run pose detection
      const frame = await provider.extractFrame(video, time * 1000);
      sampleFrames.push(frame);

      // Evaluate this frame
      const visibleLandmarks = frame.landmarks.filter(
        (lm) => lm.visibility >= MIN_VISIBILITY
      );
      const gaitVisible = GAIT_LANDMARKS.filter(
        (idx) => frame.landmarks[idx]?.visibility >= MIN_VISIBILITY
      );

      const hipLeft = frame.landmarks[POSE.LEFT_HIP];
      const hipRight = frame.landmarks[POSE.RIGHT_HIP];
      const hasHips = hipLeft?.visibility >= MIN_VISIBILITY && hipRight?.visibility >= MIN_VISIBILITY;

      samples.push({
        frameIndex: i,
        timestampMs: time * 1000,
        landmarksDetected: visibleLandmarks.length >= 10,
        landmarkCount: visibleLandmarks.length,
        bodyVisibility: gaitVisible.length / GAIT_LANDMARKS.length,
        hipCenter: hasHips
          ? { x: (hipLeft.x + hipRight.x) / 2, y: (hipLeft.y + hipRight.y) / 2 }
          : null,
      });

      onProgress?.((i + 1) / totalSamples);
    }

    // Compute aggregate quality metrics
    const bodyVisibility = mean(samples.map((s) => s.bodyVisibility));
    const frameUsabilityPct = samples.filter((s) => s.landmarksDetected).length / samples.length;
    const singlePersonConfidence = frameUsabilityPct > 0 ? 0.9 : 0.3; // Single-person model

    // Camera motion: variance of hip-center position
    const hipPositions = samples
      .filter((s) => s.hipCenter !== null)
      .map((s) => s.hipCenter!);
    const cameraMotion = hipPositions.length >= 3
      ? computeMotionScore(hipPositions)
      : 0.5; // Unknown

    // Camera angle classification
    const cameraAngle = classifyCameraAngle(sampleFrames);

    // Occlusion: inverse of average landmark count / 33
    const avgLandmarkCount = mean(samples.map((s) => s.landmarkCount));
    const occlusionSeverity = 1 - avgLandmarkCount / 33;

    // Gait cycles from ankle data
    const strikes = detectFootStrikes(sampleFrames);
    const detectedGaitCycles = Math.max(0, Math.floor(strikes.length / 2) - 1);

    // Run against quality threshold policy
    const qaDecision = evaluateQuality({
      bodyVisibility,
      singlePersonConfidence,
      cameraMotion,
      occlusionSeverity,
      frameUsabilityPct,
      detectedGaitCycles,
      resolutionWidth: width,
      resolutionHeight: height,
    });

    const assessment: VideoQualityAssessment = {
      assessmentMode: qaDecision.assessmentMode,
      usableMetrics: qaDecision.usableMetrics,
      suppressedMetrics: qaDecision.suppressedMetrics,
      confidenceMultiplier: qaDecision.confidenceMultiplier,
      result: qaDecision.result,
      bodyVisibility,
      singlePersonConfidence,
      cameraAngle,
      cameraMotion,
      occlusionSeverity,
      frameUsabilityPct,
      detectedGaitCycles,
      resolutionWidth: width,
      resolutionHeight: height,
      durationSeconds: video.duration,
      failureReasons: qaDecision.failureReasons,
      borderlineReasons: qaDecision.borderlineReasons,
      retakeInstructions: qaDecision.retakeInstructions,
      retakeSuggestions: qaDecision.retakeSuggestions,
      confidenceNotes: qaDecision.confidenceNotes,
      frameSamples: samples,
    };

    return { assessment, sampleFrames };
  } finally {
    URL.revokeObjectURL(videoURL);
    video.remove();
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function seekVideo(
  video: HTMLVideoElement,
  timeSeconds: number,
  timeoutMs: number,
): Promise<void> {
  const duration = Number.isFinite(video.duration) ? video.duration : timeSeconds;
  const clampedTime = Math.max(0, Math.min(timeSeconds, duration));

  if (Math.abs(video.currentTime - clampedTime) < 0.001 && video.readyState >= 2) {
    return;
  }

  await new Promise<void>((resolve) => {
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };

    const onSeeked = () => finish();
    const timer = setTimeout(finish, timeoutMs);

    video.addEventListener('seeked', onSeeked, { once: true });
    try {
      video.currentTime = clampedTime;
    } catch {
      finish();
    }
  });
}

/**
 * Compute camera motion score from hip-center positions.
 * Higher = more shaky. Based on position variance.
 *
 * FRONTAL FIX: In toward/away video, the subject naturally moves
 * on the Y-axis (growing/shrinking as they walk toward/away).
 * Only X-axis displacement indicates camera shake.
 * Y-axis motion is expected and should NOT be penalized.
 */
function computeMotionScore(positions: { x: number; y: number }[]): number {
  if (positions.length < 2) return 0;

  // Use X-axis displacement only for shake detection.
  // Y-axis movement is expected in frontal/away walking.
  let totalXDisplacement = 0;
  for (let i = 1; i < positions.length; i++) {
    const dx = Math.abs(positions[i].x - positions[i - 1].x);
    totalXDisplacement += dx;
  }

  const avgXDisplacement = totalXDisplacement / (positions.length - 1);

  // Score: 0 = rock steady, 1 = very shaky
  // Walking lateral sway is ~0.003 per frame at 2fps.
  // Camera shake adds significantly more.
  return Math.min(1, avgXDisplacement * 15);
}

/**
 * Classify camera angle from shoulder/hip geometry.
 *
 * Side view: shoulders appear narrow (one is occluded or very close to the other).
 * Frontal view: shoulders appear wide relative to hip-shoulder depth.
 */
function classifyCameraAngle(frames: LandmarkFrame[]): CameraAngle {
  const ratios: number[] = [];

  for (const frame of frames) {
    const ls = frame.landmarks[POSE.LEFT_SHOULDER];
    const rs = frame.landmarks[POSE.RIGHT_SHOULDER];

    if (ls.visibility < MIN_VISIBILITY || rs.visibility < MIN_VISIBILITY) continue;

    // Shoulder width in X (horizontal span)
    const shoulderWidth = Math.abs(ls.x - rs.x);

    // Use Z-depth difference if available
    const zDiff = Math.abs(ls.z - rs.z);

    // Side view: small X-span, large Z-diff
    // Frontal view: large X-span, small Z-diff
    if (shoulderWidth > 0.01) {
      ratios.push(zDiff / shoulderWidth);
    }
  }

  if (ratios.length === 0) return 'unknown';

  const avgRatio = mean(ratios);

  // Thresholds determined empirically:
  // Side view typically has ratio > 1.0 (Z-depth > X-width)
  // Frontal view typically has ratio < 0.3
  if (avgRatio > 0.8) return 'side';
  if (avgRatio < 0.4) return 'frontal';
  return 'oblique';
}
