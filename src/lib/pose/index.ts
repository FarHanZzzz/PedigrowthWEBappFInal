// PEDI-GROWTH — Pose Provider Abstraction
// Interface and factory for swappable pose estimation backends.

import type { PoseProvider, LandmarkFrame } from '@/lib/types';

const MAX_ANALYSIS_DURATION_SECONDS = 20;
const SEEK_TIMEOUT_MS = 2500;

/**
 * Create a pose provider instance.
 * Currently only MediaPipe is supported.
 * MoveNet can be re-added later if needed.
 */
export async function createPoseProvider(
  providerName: 'mediapipe' = 'mediapipe'
): Promise<PoseProvider> {
  switch (providerName) {
    case 'mediapipe': {
      // Lazy import to avoid loading WASM until needed
      const { MediaPipePoseProvider } = await import('./mediapipe-provider');
      return new MediaPipePoseProvider();
    }

    default:
      throw new Error(`Unknown pose provider: ${providerName}`);
  }
}

/**
 * Extract landmarks from a video element.
 * Processes at target FPS for the configured extraction window.
 */
export async function extractLandmarkSequence(
  provider: PoseProvider,
  video: HTMLVideoElement,
  targetFps: number = 10,
  onProgress?: (fraction: number) => void,
): Promise<LandmarkFrame[]> {
  const frames: LandmarkFrame[] = [];
  const duration = resolveExtractionDuration(video.duration);
  if (duration <= 0) return frames;

  const interval = 1 / targetFps;
  const sampleCount = Math.max(1, Math.floor(duration * targetFps));

  for (let sampleIdx = 0; sampleIdx < sampleCount; sampleIdx++) {
    const time = Math.min(sampleIdx * interval, duration);
    await seekVideo(video, time, SEEK_TIMEOUT_MS);

    const frame = await provider.extractFrame(video, time * 1000);
    frames.push(frame);

    // Report sub-stage progress so the UI doesn't appear stuck
    if (onProgress) {
      onProgress((sampleIdx + 1) / sampleCount);
    }
  }

  return frames;
}

export function resolveExtractionDuration(videoDurationSeconds: number): number {
  if (!Number.isFinite(videoDurationSeconds) || videoDurationSeconds <= 0) {
    return 0;
  }
  // Cap extraction window to keep browser-side analysis responsive on lower-end devices.
  return Math.min(videoDurationSeconds, MAX_ANALYSIS_DURATION_SECONDS);
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
