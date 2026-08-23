// PEDI-GROWTH — Pose Provider Abstraction
// Interface and factory for swappable pose estimation backends.

import type { PoseProvider, LandmarkFrame } from '@/lib/types';
import {
  getExtractionTimeBudgetMs,
  getSeekTimeoutMs,
  resolvePlayableDuration,
  seekVideoTo,
  snapshotVideoFrameAsync,
} from '@/lib/pose/videoFrameSource';

const MAX_ANALYSIS_DURATION_SECONDS = 20;
// Hard cap for one extraction pass. On slow devices (CPU-only WASM inference,
// sluggish video seeks) an unbounded loop can run for many minutes and the UI
// appears frozen. Past this budget we stop and analyze the frames we have.

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
  durationOverride?: number,
): Promise<LandmarkFrame[]> {
  const frames: LandmarkFrame[] = [];
  const duration = resolveExtractionDuration(
    durationOverride && durationOverride > 0
      ? durationOverride
      : resolvePlayableDuration(video),
  );
  if (duration <= 0) return frames;

  const interval = 1 / targetFps;
  const sampleCount = Math.max(1, Math.floor(duration * targetFps));
  const startedAt = performance.now();
  const canvas = document.createElement('canvas');
  const extractionBudgetMs = getExtractionTimeBudgetMs();

  for (let sampleIdx = 0; sampleIdx < sampleCount; sampleIdx++) {
    if (performance.now() - startedAt > extractionBudgetMs) {
      console.warn(
        `[Pedi-Growth] Landmark extraction exceeded ${extractionBudgetMs / 1000}s budget; ` +
        `continuing with ${frames.length}/${sampleCount} sampled frames.`,
      );
      break;
    }

    const time = Math.min(sampleIdx * interval, duration);
    await seekVideoTo(video, time, getSeekTimeoutMs());

    const source = await snapshotVideoFrameAsync(video, canvas);
    const frame = await provider.extractFrame(source, time * 1000);
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
