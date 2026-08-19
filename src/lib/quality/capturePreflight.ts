export type PreflightSeverity = 'pass' | 'warning' | 'fail';

export interface CapturePreflightIssue {
  id: 'duration' | 'resolution' | 'lighting' | 'stability';
  label: string;
  severity: PreflightSeverity;
  message: string;
}

export interface CapturePreflightResult {
  overall: PreflightSeverity;
  durationSeconds: number;
  resolution: { width: number; height: number };
  brightnessScore: number;
  motionScore: number;
  sampledFrames: number;
  issues: CapturePreflightIssue[];
  recommendations: string[];
}

const PREVIEW_SECONDS = 2.5;
const SAMPLE_INTERVAL_SECONDS = 0.5;

export async function runCapturePreflight(videoBlob: Blob): Promise<CapturePreflightResult> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  const blobUrl = URL.createObjectURL(videoBlob);
  video.src = blobUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video for preflight check.'));
    });

    const width = video.videoWidth;
    const height = video.videoHeight;
    const durationSeconds = Number.isFinite(video.duration) ? video.duration : 0;

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Canvas is unavailable for preflight check.');
    }

    const sampleWindow = Math.max(0.1, Math.min(PREVIEW_SECONDS, durationSeconds || PREVIEW_SECONDS));
    const sampleTimes: number[] = [];
    for (let t = 0; t < sampleWindow; t += SAMPLE_INTERVAL_SECONDS) {
      sampleTimes.push(t);
    }
    if (sampleTimes.length === 0) {
      sampleTimes.push(0);
    }

    const brightnessValues: number[] = [];
    const motionValues: number[] = [];

    let previousFrame: Uint8ClampedArray | null = null;
    for (const time of sampleTimes) {
      await seekTo(video, time);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      let brightnessSum = 0;
      const pixels = canvas.width * canvas.height;
      for (let i = 0; i < image.length; i += 4) {
        brightnessSum += (image[i] + image[i + 1] + image[i + 2]) / 3;
      }
      const brightness = brightnessSum / (pixels * 255);
      brightnessValues.push(brightness);

      if (previousFrame) {
        let diffSum = 0;
        let count = 0;
        for (let i = 0; i < image.length; i += 16) {
          const curr = (image[i] + image[i + 1] + image[i + 2]) / 3;
          const prev = (previousFrame[i] + previousFrame[i + 1] + previousFrame[i + 2]) / 3;
          diffSum += Math.abs(curr - prev);
          count += 1;
        }
        const motion = count > 0 ? diffSum / (count * 255) : 0;
        motionValues.push(motion);
      }

      previousFrame = image;
    }

    const brightnessScore = average(brightnessValues);
    const motionScore = average(motionValues);

    const issues: CapturePreflightIssue[] = [];

    issues.push(buildDurationIssue(durationSeconds));
    issues.push(buildResolutionIssue(width, height));
    issues.push(buildLightingIssue(brightnessScore));
    issues.push(buildStabilityIssue(motionScore));

    const overall = issues.some((issue) => issue.severity === 'fail')
      ? 'fail'
      : issues.some((issue) => issue.severity === 'warning')
        ? 'warning'
        : 'pass';

    const recommendations = issues
      .filter((issue) => issue.severity !== 'pass')
      .map((issue) => issue.message);

    return {
      overall,
      durationSeconds,
      resolution: { width, height },
      brightnessScore,
      motionScore,
      sampledFrames: sampleTimes.length,
      issues,
      recommendations,
    };
  } finally {
    URL.revokeObjectURL(blobUrl);
    video.remove();
  }
}

async function seekTo(video: HTMLVideoElement, seconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      resolve(); // Resolve anyway to proceed instead of hanging or failing the whole check
    };
    const cleanup = () => {
      if (timeout !== null) {
        clearTimeout(timeout);
      }
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    
    const targetTime = Math.min(Math.max(seconds, 0), Math.max(video.duration - 0.05, 0));
    
    if (Math.abs(video.currentTime - targetTime) < 0.01) {
      cleanup();
      resolve();
      return;
    }
    
    video.currentTime = targetTime;
    
    timeout = setTimeout(() => {
      cleanup();
      resolve(); // Timeout fallback
    }, 1500); // Wait at most 1.5s per frame
  });
}

function buildDurationIssue(durationSeconds: number): CapturePreflightIssue {
  if (durationSeconds < 3) {
    return {
      id: 'duration',
      label: 'Clip length',
      severity: 'fail',
      message: 'Record at least 4 to 6 walking steps (usually 3+ seconds).',
    };
  }
  if (durationSeconds < 4.5) {
    return {
      id: 'duration',
      label: 'Clip length',
      severity: 'warning',
      message: 'A slightly longer clip can improve confidence in the final report.',
    };
  }
  return {
    id: 'duration',
    label: 'Clip length',
    severity: 'pass',
    message: 'Clip length looks sufficient.',
  };
}

function buildResolutionIssue(width: number, height: number): CapturePreflightIssue {
  if (width < 320 || height < 240) {
    return {
      id: 'resolution',
      label: 'Video resolution',
      severity: 'fail',
      message: 'Switch to a higher camera quality setting before recording.',
    };
  }
  if (width < 640 || height < 480) {
    return {
      id: 'resolution',
      label: 'Video resolution',
      severity: 'warning',
      message: 'Resolution is usable but higher quality video improves tracking stability.',
    };
  }
  return {
    id: 'resolution',
    label: 'Video resolution',
    severity: 'pass',
    message: 'Resolution is good for analysis.',
  };
}

function buildLightingIssue(brightnessScore: number): CapturePreflightIssue {
  if (brightnessScore < 0.16) {
    return {
      id: 'lighting',
      label: 'Lighting',
      severity: 'fail',
      message: 'Scene is very dark. Move to a brighter area to avoid missed landmarks.',
    };
  }
  if (brightnessScore < 0.28) {
    return {
      id: 'lighting',
      label: 'Lighting',
      severity: 'warning',
      message: 'Lighting is limited. Extra light will improve frame usability.',
    };
  }
  return {
    id: 'lighting',
    label: 'Lighting',
    severity: 'pass',
    message: 'Lighting level looks acceptable.',
  };
}

function buildStabilityIssue(motionScore: number): CapturePreflightIssue {
  if (motionScore > 0.4) {
    return {
      id: 'stability',
      label: 'Camera stability',
      severity: 'fail',
      message: 'Camera motion is very high. Place the phone on a stable surface.',
    };
  }
  if (motionScore > 0.28) {
    return {
      id: 'stability',
      label: 'Camera stability',
      severity: 'warning',
      message: 'Some camera shake detected. A steadier recording may improve confidence.',
    };
  }
  return {
    id: 'stability',
    label: 'Camera stability',
    severity: 'pass',
    message: 'Camera appears reasonably stable.',
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
