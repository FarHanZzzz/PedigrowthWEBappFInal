"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera } from "lucide-react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalysisTrace, KeyFrame, KeyFrameSet } from "@/lib/trace/traceTypes";
import { TRACE_COLORS } from "@/lib/trace/traceTypes";

interface Props {
  keyFrames: KeyFrameSet;
  trace: AnalysisTrace;
  videoUrl?: string | null;
  renderMode?: "timestamps-only" | "auto-thumbnails";
  onFrameClick?: (frameIndex: number) => void;
}

interface GalleryFrame {
  key: string;
  frame: KeyFrame;
}

export default function KeyFrameGallery({
  keyFrames,
  trace,
  videoUrl = null,
  renderMode = "timestamps-only",
  onFrameClick,
}: Props) {
  const allFrames = useMemo<GalleryFrame[]>(() => {
    const merged = [
      keyFrames.firstUsable,
      ...keyFrames.leftStepFrames.slice(0, 3),
      ...keyFrames.rightStepFrames.slice(0, 3),
      keyFrames.worstConfidence,
      keyFrames.mostAsymmetric,
    ].filter((frame): frame is KeyFrame => Boolean(frame));

    return merged.map((frame) => ({
      key: `${frame.label}-${frame.frameIndex}-${frame.timestampMs}`,
      frame,
    }));
  }, [keyFrames]);

  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    if (renderMode !== "auto-thumbnails" || !videoUrl || allFrames.length === 0) {
      return;
    }

    let cancelled = false;

    const captureThumbnails = async () => {
      try {
        const video = document.createElement("video");
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = "anonymous";
        video.src = videoUrl;

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
            reject(new Error("Could not load video metadata for thumbnails"));
          };
          const cleanup = () => {
            video.removeEventListener("loadedmetadata", onLoaded);
            video.removeEventListener("error", onError);
          };

          video.addEventListener("loadedmetadata", onLoaded);
          video.addEventListener("error", onError);
        });

        if (cancelled) {
          return;
        }

        const canvas = document.createElement("canvas");
        const aspect =
          video.videoWidth > 0 && video.videoHeight > 0
            ? video.videoWidth / video.videoHeight
            : trace.videoMeta.width / Math.max(trace.videoMeta.height, 1);
        const thumbWidth = 320;
        const thumbHeight = Math.max(1, Math.round(thumbWidth / (aspect || 16 / 9)));
        canvas.width = thumbWidth;
        canvas.height = thumbHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return;
        }

        const captured: Record<string, string> = {};
        const durationSeconds =
          Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : trace.videoMeta.durationMs / 1000;

        for (const item of allFrames) {
          if (cancelled) {
            return;
          }

          const rawSeekSeconds = item.frame.timestampMs / 1000;
          const safeSeekSeconds = Math.min(
            Math.max(rawSeekSeconds, 0),
            Math.max(0, durationSeconds - 0.01)
          );

          await new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              video.removeEventListener("seeked", onSeeked);
              resolve();
            };
            const onSeeked = () => finish();

            video.addEventListener("seeked", onSeeked);
            video.currentTime = safeSeekSeconds;

            window.setTimeout(finish, 300);
          });

          if (cancelled) {
            return;
          }

          ctx.drawImage(video, 0, 0, thumbWidth, thumbHeight);
          captured[item.key] = canvas.toDataURL("image/jpeg", 0.72);
        }

        if (!cancelled) {
          setThumbnails(captured);
        }
      } catch {
        if (!cancelled) {
          setThumbnails({});
        }
      }
    };

    void captureThumbnails();

    return () => {
      cancelled = true;
    };
  }, [allFrames, renderMode, trace.videoMeta.durationMs, trace.videoMeta.height, trace.videoMeta.width, videoUrl]);

  if (allFrames.length === 0) {
    return null;
  }

  const activeThumbnails = renderMode === "auto-thumbnails" && videoUrl ? thumbnails : {};
  const hasRealThumbnails = Object.keys(activeThumbnails).length > 0;
  const cardTitle = hasRealThumbnails ? "Key moments" : "Key timestamps";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Camera className="h-4 w-4" />
          {cardTitle} ({allFrames.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          {hasRealThumbnails
            ? "Select a moment to jump directly to that frame in the hero video."
            : "Select a timestamp to jump directly to the matching moment in the hero video."}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {allFrames.map((item) => {
            const kf = item.frame;
            const frame = trace.frames[kf.frameIndex];
            const visPct = frame ? Math.round(frame.bodyVisibility * 100) : 0;
            const thumbnailSrc = activeThumbnails[item.key];

            const isStep = kf.label === "L step" || kf.label === "R step";
            const isLeft = kf.label === "L step";
            const borderColor = isStep
              ? isLeft
                ? TRACE_COLORS.leftSide
                : TRACE_COLORS.rightSide
              : kf.label === "Lowest confidence"
                ? TRACE_COLORS.qualityBad
                : kf.label === "Most asymmetric"
                  ? TRACE_COLORS.qualityMedium
                  : TRACE_COLORS.qualityGood;

            return (
              <button
                key={item.key}
                onClick={() => onFrameClick?.(kf.frameIndex)}
                className="touch-target relative rounded-lg border-2 p-3 text-left transition-colors hover:bg-muted/30 cursor-pointer"
                style={{ borderColor }}
              >
                <div className="mb-2 overflow-hidden rounded bg-muted/20">
                  {thumbnailSrc ? (
                    <Image
                      src={thumbnailSrc}
                      alt={`${kf.label} at ${(kf.timestampMs / 1000).toFixed(1)} seconds`}
                      width={320}
                      height={180}
                      unoptimized
                      className="aspect-video w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center px-2 text-center text-[11px] text-muted-foreground">
                      Timestamp only
                    </div>
                  )}
                </div>

                <p className="truncate text-xs font-semibold text-foreground">{kf.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  #{kf.frameIndex + 1} · {(kf.timestampMs / 1000).toFixed(1)}s
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {visPct}% vis
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground/80">
                  {kf.reason}
                </p>
                <p className="mt-2 text-[11px] font-medium text-primary">Jump to this timestamp</p>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
