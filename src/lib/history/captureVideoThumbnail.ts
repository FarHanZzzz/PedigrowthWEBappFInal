import {
  prepareAnalysisVideo,
  seekVideoTo,
} from "@/lib/pose/videoFrameSource";

async function frameToDataUrl(video: HTMLVideoElement): Promise<string | null> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width < 2 || height < 2) return null;

  const canvas = document.createElement("canvas");
  const thumbWidth = 480;
  const thumbHeight = Math.max(1, Math.round((thumbWidth * height) / width));
  canvas.width = thumbWidth;
  canvas.height = thumbHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, thumbWidth, thumbHeight);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export async function captureVideoThumbnail(blob: Blob): Promise<string | null> {
  const prepared = await prepareAnalysisVideo(blob);
  try {
    const seekTime = Math.min(
      Math.max(prepared.durationSeconds * 0.35, 0),
      Math.max(prepared.durationSeconds - 0.05, 0),
    );
    await seekVideoTo(prepared.video, seekTime);
    return frameToDataUrl(prepared.video);
  } catch {
    return null;
  } finally {
    prepared.dispose();
  }
}

export async function captureThumbnailFromUrl(url: string): Promise<string | null> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  if (!url.startsWith("blob:")) {
    video.crossOrigin = "anonymous";
  }
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= 1) {
        resolve();
        return;
      }
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Could not load clip for thumbnail"));
      };
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeEventListener("error", onError);
      };
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("error", onError);
    });

    const duration =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 6;
    const seekTime = Math.min(Math.max(duration * 0.35, 0), Math.max(duration - 0.05, 0));

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener("seeked", finish);
        resolve();
      };
      video.addEventListener("seeked", finish);
      video.currentTime = seekTime;
      window.setTimeout(finish, 1200);
    });

    return frameToDataUrl(video);
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}
