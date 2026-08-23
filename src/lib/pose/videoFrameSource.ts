// Shared video loading / seeking for pose extraction.
// Desktop file uploads usually have a finite duration and reliable seeks.
// Phone recordings often do not: MediaRecorder blobs report duration Infinity,
// iOS Safari does not decode a frame until play(), and GPU pose init fails.

const METADATA_TIMEOUT_MS_DESKTOP = 8000;
const METADATA_TIMEOUT_MS_MOBILE = 14000;
const SEEK_TIMEOUT_MS_DESKTOP = 2500;
const SEEK_TIMEOUT_MS_MOBILE = 4500;
const DEFAULT_UNKNOWN_DURATION_SECONDS = 8;
const EXTRACTION_TIME_BUDGET_MS_DESKTOP = 90_000;
const EXTRACTION_TIME_BUDGET_MS_MOBILE = 120_000;

export function isLikelyMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPod|Mobile/i.test(ua)) return true;
  // iPadOS 13+ reports as Macintosh.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function getSeekTimeoutMs(): number {
  return isLikelyMobileBrowser() ? SEEK_TIMEOUT_MS_MOBILE : SEEK_TIMEOUT_MS_DESKTOP;
}

export function getExtractionTimeBudgetMs(): number {
  return isLikelyMobileBrowser()
    ? EXTRACTION_TIME_BUDGET_MS_MOBILE
    : EXTRACTION_TIME_BUDGET_MS_DESKTOP;
}

export type PreparedAnalysisVideo = {
  video: HTMLVideoElement;
  objectUrl: string;
  durationSeconds: number;
  dispose: () => void;
};

export function resolvePlayableDuration(video: {
  duration: number;
  seekable?: { length: number; end: (index: number) => number };
  buffered?: { length: number; end: (index: number) => number };
}): number {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration;
  }

  if (video.seekable && video.seekable.length > 0) {
    const end = video.seekable.end(video.seekable.length - 1);
    if (Number.isFinite(end) && end > 0) return end;
  }

  if (video.buffered && video.buffered.length > 0) {
    const end = video.buffered.end(video.buffered.length - 1);
    if (Number.isFinite(end) && end > 0) return end;
  }

  return 0;
}

export function prepareVideoElement(): HTMLVideoElement {
  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.preload = "auto";
  video.controls = false;
  video.disablePictureInPicture = true;
  return video;
}

export async function prepareAnalysisVideo(blob: Blob): Promise<PreparedAnalysisVideo> {
  const video = prepareVideoElement();
  const objectUrl = URL.createObjectURL(blob);
  const metadataTimeout = isLikelyMobileBrowser()
    ? METADATA_TIMEOUT_MS_MOBILE
    : METADATA_TIMEOUT_MS_DESKTOP;

  const metadataReady = waitForEvent(
    video,
    "loadedmetadata",
    metadataTimeout,
    "Could not read this clip on this device.",
  );
  video.src = objectUrl;
  video.load();
  await metadataReady;

  await primeVideoDecoder(video);
  await discoverDurationIfNeeded(video);

  if (video.readyState < 2) {
    await waitForEvent(video, "canplay", isLikelyMobileBrowser() ? 4000 : 2500).catch(() => undefined);
  }

  await ensureDecodedFrame(video);

  let durationSeconds = resolvePlayableDuration(video);
  if (durationSeconds <= 0) {
    durationSeconds = DEFAULT_UNKNOWN_DURATION_SECONDS;
  }

  return {
    video,
    objectUrl,
    durationSeconds,
    dispose: () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
      video.remove();
    },
  };
}

export async function seekVideoTo(
  video: HTMLVideoElement,
  timeSeconds: number,
  timeoutMs: number = getSeekTimeoutMs(),
): Promise<void> {
  const duration = resolvePlayableDuration(video);
  const maxTime = duration > 0 ? Math.max(0, duration - 0.04) : timeSeconds;
  const target = Math.max(0, Math.min(timeSeconds, maxTime));

  if (Math.abs(video.currentTime - target) < 0.04 && video.readyState >= 2) {
    await ensureDecodedFrame(video);
    return;
  }

  await new Promise<void>((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };

    const onSeeked = () => {
      requestAnimationFrame(() => finish());
    };

    timer = setTimeout(() => {
      void playThroughTarget(video, target).finally(finish);
    }, timeoutMs);

    video.addEventListener("seeked", onSeeked, { once: true });
    try {
      video.currentTime = target;
    } catch {
      finish();
    }
  });

  await ensureDecodedFrame(video);
}

export function snapshotVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): HTMLCanvasElement | HTMLVideoElement {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width < 2 || height < 2) {
    return video;
  }

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return video;

  ctx.drawImage(video, 0, 0, width, height);
  return canvas;
}

export async function snapshotVideoFrameAsync(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Promise<HTMLCanvasElement | HTMLVideoElement> {
  await ensureDecodedFrame(video);
  return snapshotVideoFrame(video, canvas);
}

async function ensureDecodedFrame(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth >= 2 && video.videoHeight >= 2 && video.readyState >= 2) {
    return;
  }

  const attempts = isLikelyMobileBrowser() ? 3 : 2;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const playAttempt = video.play();
      if (playAttempt) await playAttempt;
    } catch {
      // Autoplay may be blocked; seeking may still work after load().
    }

    await waitForDecodedDimensions(
      video,
      isLikelyMobileBrowser() ? 2000 : 900,
    );

    try {
      video.pause();
    } catch {
      // Ignore pause failures.
    }

    if (video.videoWidth >= 2 && video.videoHeight >= 2) {
      return;
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function waitForDecodedDimensions(
  video: HTMLVideoElement,
  timeoutMs: number,
): Promise<void> {
  if (video.videoWidth >= 2 && video.videoHeight >= 2) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let frameCallbackId = 0;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener("loadeddata", finish);
      video.removeEventListener("timeupdate", finish);
      if (
        frameCallbackId &&
        "cancelVideoFrameCallback" in video &&
        typeof video.cancelVideoFrameCallback === "function"
      ) {
        video.cancelVideoFrameCallback(frameCallbackId);
      }
      resolve();
    };

    const timer = setTimeout(finish, timeoutMs);

    if (
      "requestVideoFrameCallback" in video &&
      typeof video.requestVideoFrameCallback === "function"
    ) {
      frameCallbackId = video.requestVideoFrameCallback(() => finish());
    } else {
      video.addEventListener("loadeddata", finish, { once: true });
      video.addEventListener("timeupdate", finish, { once: true });
    }
  });
}

async function waitForEvent(
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "canplay" | "seeked",
  timeoutMs: number,
  timeoutMessage?: string,
): Promise<void> {
  if (eventName === "loadedmetadata" && video.readyState >= 1) return;
  if (eventName === "canplay" && video.readyState >= 2) return;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      if (timeoutMessage) {
        reject(new Error(timeoutMessage));
        return;
      }
      resolve();
    }, timeoutMs);

    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("This clip could not be decoded on this device."));
    };
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
    };

    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

async function primeVideoDecoder(video: HTMLVideoElement): Promise<void> {
  try {
    const playAttempt = video.play();
    if (playAttempt) await playAttempt;
    await waitForDecodedDimensions(video, isLikelyMobileBrowser() ? 1600 : 700);
    video.pause();
  } catch {
    // Autoplay can still fail on some browsers; seeking may work after load().
  }
}

async function discoverDurationIfNeeded(video: HTMLVideoElement): Promise<void> {
  if (resolvePlayableDuration(video) > 0) return;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), isLikelyMobileBrowser() ? 1800 : 1200);
    const onSeeked = () => {
      clearTimeout(timer);
      resolve();
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    try {
      video.currentTime = 1e10;
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });

  try {
    video.currentTime = 0;
  } catch {
    // Ignore rewind failures; later seeks still proceed.
  }
}

async function playThroughTarget(video: HTMLVideoElement, target: number): Promise<void> {
  try {
    const playAttempt = video.play();
    if (playAttempt) await playAttempt;
    const started = performance.now();
    const budgetMs = isLikelyMobileBrowser() ? 1600 : 900;
    while (performance.now() - started < budgetMs) {
      if (video.currentTime + 0.08 >= target) break;
      await waitForDecodedDimensions(video, 120);
      if (video.videoWidth >= 2 && video.videoHeight >= 2 && video.currentTime + 0.08 >= target) {
        break;
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    video.pause();
  } catch {
    // If play is blocked, keep the last decoded frame rather than throwing.
  }
}
