"use client";

// GAITBRIDGE — Annotated Video Player (v2 — Annotation Quality Recovery)
//
// Video + Canvas overlay, synchronized via requestAnimationFrame.
//
// CHANGES FROM v1:
// 1. Canvas backing size uses devicePixelRatio for crisp rendering
// 2. Passes video native dimensions to renderer for proper transform
// 3. Clean/Debug mode toggle
// 4. Default layers are clean-mode only (no skeleton)
// 5. Better step timeline with tick marks

import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Rewind, Eye, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderOverlay, type RenderMode } from "./OverlayRenderer";
import type { AnalysisTrace, OverlayLayer } from "@/lib/trace/traceTypes";
import { OVERLAY_LAYER_LABELS, TRACE_COLORS } from "@/lib/trace/traceTypes";

interface Props {
  trace: AnalysisTrace;
  videoUrl: string;
  jumpToFrameIndex?: number | null;
  audience?: "caregiver" | "clinician";
  showAdvancedControls?: boolean;
  onFrameChange?: (frameIndex: number, timestampMs: number) => void;
}

const SPEED_OPTIONS = [0.25, 0.5, 1];

// Clean mode: minimal, professional overlays only
const CLEAN_LAYERS: OverlayLayer[] = [
  'shoulderLine',
  'hipLine',
  'bodyMidline',
  'stepMarkers',
  'ankleTrails',
  'pathCorridor',
];

// Debug mode: everything
const DEBUG_LAYERS: OverlayLayer[] = [
  'skeleton',
  'stepMarkers',
  'hipLine',
  'shoulderLine',
  'bodyMidline',
  'ankleTrails',
  'pathCorridor',
];

export default function AnnotatedVideoPlayer({
  trace,
  videoUrl,
  jumpToFrameIndex = null,
  audience = "clinician",
  showAdvancedControls = false,
  onFrameChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const isCaregiver = audience === "caregiver";
  const canShowAdvancedControls = !isCaregiver && showAdvancedControls;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [renderMode, setRenderMode] = useState<RenderMode>('clean');
  const [activeLayers, setActiveLayers] = useState<Set<OverlayLayer>>(
    new Set(CLEAN_LAYERS)
  );
  const [videoReady, setVideoReady] = useState(false);

  // Track video native dimensions
  const [videoDims, setVideoDims] = useState({ width: 0, height: 0 });
  const [canvasMetrics, setCanvasMetrics] = useState({
    cssWidth: 0,
    cssHeight: 0,
    backingWidth: 0,
    backingHeight: 0,
    devicePixelRatio: 1,
  });

  // ── Video sync ────────────────────────────────────────────────

  const getFrameForTime = useCallback(
    (timeMs: number): number => {
      if (trace.frames.length === 0) return 0;
      // Find closest frame by timestamp
      let closest = 0;
      let closestDist = Infinity;
      for (let i = 0; i < trace.frames.length; i++) {
        const dist = Math.abs(trace.frames[i].timestampMs - timeMs);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }
      return closest;
    },
    [trace.frames]
  );


  // Canvas sizing — use devicePixelRatio for crisp rendering
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = video.clientWidth;
      const cssH = video.clientHeight;
      const backingW = cssW * dpr;
      const backingH = cssH * dpr;

      // Set backing resolution to CSS size × DPR for crisp rendering
      canvas.width = backingW;
      canvas.height = backingH;

      // Scale context so drawing uses CSS-pixel coordinates
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      // Store actual CSS dimensions for the renderer
      // (the renderer will use canvas.width/height but we've scaled by DPR,
      //  so we pass the CSS dimensions as the logical canvas size)
      canvas.dataset.cssWidth = String(cssW);
      canvas.dataset.cssHeight = String(cssH);
      setCanvasMetrics({
        cssWidth: cssW,
        cssHeight: cssH,
        backingWidth: backingW,
        backingHeight: backingH,
        devicePixelRatio: dpr,
      });
    };

    const onMetadata = () => {
      setVideoDims({ width: video.videoWidth, height: video.videoHeight });
      resize();
      setVideoReady(true);
    };

    video.addEventListener("loadedmetadata", onMetadata);

    const ro = new ResizeObserver(resize);
    ro.observe(video);

    // If metadata already loaded
    if (video.readyState >= 1) {
      onMetadata();
    }

    return () => {
      ro.disconnect();
      video.removeEventListener("loadedmetadata", onMetadata);
    };
  }, []);

  // Override renderCurrentFrame to use CSS dimensions instead of canvas backing
  const renderCurrentFrameFixed = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || trace.frames.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Use CSS dimensions (not backing × DPR)
    const cssW = parseInt(canvas.dataset.cssWidth || String(canvas.width));
    const cssH = parseInt(canvas.dataset.cssHeight || String(canvas.height));

    const timeMs = video.currentTime * 1000;
    const frameIdx = getFrameForTime(timeMs);
    setCurrentFrameIndex((prev) => (prev === frameIdx ? prev : frameIdx));

    const frame = trace.frames[frameIdx];
    if (!frame) return;

    const trailStart = Math.max(0, frameIdx - 8);
    const ankleTrailHistory = trace.frames.slice(trailStart, frameIdx + 1);

    const hipTrailHistory = trace.frames
      .slice(0, frameIdx + 1)
      .filter((f) => f.hipMidpoint)
      .map((f) => f.hipMidpoint!);

    renderOverlay(ctx, frame, activeLayers, cssW, cssH, {
      stepEvents: trace.stepEvents,
      currentFrameIndex: frameIdx,
      ankleTrailHistory,
      hipTrailHistory,
      videoNativeWidth: videoDims.width || trace.videoMeta.width,
      videoNativeHeight: videoDims.height || trace.videoMeta.height,
      mode: renderMode,
    });
  }, [trace, activeLayers, getFrameForTime, videoDims, renderMode]);

  useEffect(() => {
    if (jumpToFrameIndex === null || jumpToFrameIndex === undefined) return;
    const video = videoRef.current;
    const frame = trace.frames[jumpToFrameIndex];
    if (!video || !frame) return;
    video.pause();
    video.currentTime = frame.timestampMs / 1000;
  }, [jumpToFrameIndex, trace.frames]);

  // Keep frame overlays in sync during scrubs/seeks even when paused.
  useEffect(() => {
    if (!videoReady) return;
    const video = videoRef.current;
    if (!video) return;

    const syncFrame = () => {
      renderCurrentFrameFixed();
    };

    video.addEventListener("timeupdate", syncFrame);
    video.addEventListener("seeked", syncFrame);
    video.addEventListener("pause", syncFrame);
    syncFrame();

    return () => {
      video.removeEventListener("timeupdate", syncFrame);
      video.removeEventListener("seeked", syncFrame);
      video.removeEventListener("pause", syncFrame);
    };
  }, [videoReady, renderCurrentFrameFixed]);

  // Run high-frequency overlay updates only while video is actively playing.
  useEffect(() => {
    if (!videoReady || !isPlaying) return;

    const tick = () => {
      renderCurrentFrameFixed();
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [videoReady, isPlaying, renderCurrentFrameFixed]);

  // ── Controls ──────────────────────────────────────────────────

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.playbackRate = speed;
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const stepFrame = (direction: -1 | 1) => {
    const video = videoRef.current;
    if (!video || trace.frames.length === 0) return;
    video.pause();
    setIsPlaying(false);

    const newIdx = Math.max(0, Math.min(trace.frames.length - 1, currentFrameIndex + direction));
    video.currentTime = trace.frames[newIdx].timestampMs / 1000;
    setCurrentFrameIndex(newIdx);
  };

  const jumpToAdjacentKeyMoment = (direction: -1 | 1) => {
    const video = videoRef.current;
    if (!video || trace.stepEvents.length === 0) {
      stepFrame(direction);
      return;
    }

    const sorted = [...trace.stepEvents].sort((a, b) => a.frameIndex - b.frameIndex);
    const current = currentFrameIndex;

    const target =
      direction === -1
        ? [...sorted].reverse().find((event) => event.frameIndex < current) ?? sorted[0]
        : sorted.find((event) => event.frameIndex > current) ?? sorted[sorted.length - 1];

    video.pause();
    setIsPlaying(false);
    video.currentTime = target.timestampMs / 1000;
    setCurrentFrameIndex(target.frameIndex);
  };

  const cycleSpeed = () => {
    const idx = SPEED_OPTIONS.indexOf(speed);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const toggleMode = () => {
    if (isCaregiver) return;
    const newMode = renderMode === 'clean' ? 'debug' : 'clean';
    setRenderMode(newMode);
    setActiveLayers(new Set(newMode === 'clean' ? CLEAN_LAYERS : DEBUG_LAYERS));
  };

  const toggleLayer = (layer: OverlayLayer) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  const currentFrame = trace.frames[currentFrameIndex];
  const currentEvent = trace.stepEvents.find((event) => event.frameIndex === currentFrameIndex);
  const bodyVisPct = currentFrame ? Math.round(currentFrame.bodyVisibility * 100) : 0;
  const timeStr = currentFrame
    ? `${(currentFrame.timestampMs / 1000).toFixed(2)}s`
    : "0.00s";
  const modeBadgeLabel = renderMode === "clean" ? "Standard overlay" : "Advanced overlay";

  useEffect(() => {
    if (!onFrameChange) return;
    const frame = trace.frames[currentFrameIndex];
    onFrameChange(currentFrameIndex, frame?.timestampMs ?? 0);
  }, [currentFrameIndex, onFrameChange, trace.frames]);

  return (
    <div className="space-y-3">
      {/* Video + Canvas */}
      <div className="relative rounded-lg overflow-hidden bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full"
          style={{ objectFit: 'contain' }}
          muted
          playsInline
          preload="auto"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ objectFit: 'contain' }}
        />

        <div className="absolute left-2 top-2 flex flex-wrap gap-2">
          {!isCaregiver && (
            <>
              <span className="rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white">
                {trace.run.classification === "real_analysis"
                  ? "Real analysis"
                  : trace.run.classification.toUpperCase()}
              </span>
              <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white/90">
                {trace.pipeline.direction === "toward" ? "Toward camera" : trace.pipeline.direction}
              </span>
              {renderMode === "debug" && (
                <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white/90">
                  Tracking {bodyVisPct >= 70 ? "High" : bodyVisPct >= 40 ? "Medium" : "Low"}
                </span>
              )}
            </>
          )}
        </div>

        {/* Frame info overlay */}
          {!isCaregiver && (
            <div className="absolute bottom-2 left-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-mono text-white">
                #{currentFrameIndex + 1}/{trace.frames.length}
              </span>
              <span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-mono text-white">
                {timeStr}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-mono ${
                  bodyVisPct >= 70
                    ? "bg-green-900/60 text-green-300"
                    : bodyVisPct >= 40
                    ? "bg-yellow-900/60 text-yellow-300"
                    : "bg-red-900/60 text-red-300"
                }`}
              >
                {bodyVisPct}% visible
              </span>
              {currentEvent && (
                <span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-mono text-white">
                  {currentEvent.side === "left" ? "Left step" : "Right step"} {Math.round(currentEvent.confidence * 100)}%
                </span>
              )}
            </div>
        )}

        {canShowAdvancedControls && (
          <div className="absolute top-2 right-2">
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
              renderMode === 'clean'
                ? "bg-green-900/50 text-green-300"
                : "bg-orange-900/50 text-orange-300"
            }`}>
              {modeBadgeLabel}
            </span>
          </div>
        )}
      </div>

      {/* Confidence strip */}
      {!isCaregiver && (
        <div className="h-4 rounded-full overflow-hidden flex bg-muted/30">
          {trace.frames.map((f, i) => (
            <div
              key={i}
              className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
              style={{
                backgroundColor: f.bodyVisibility >= 0.7
                  ? TRACE_COLORS.qualityGood
                  : f.bodyVisibility >= 0.4
                  ? TRACE_COLORS.qualityMedium
                  : TRACE_COLORS.qualityBad,
                opacity: i === currentFrameIndex ? 1 : 0.5,
              }}
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.pause();
                  setIsPlaying(false);
                  videoRef.current.currentTime = f.timestampMs / 1000;
                  setCurrentFrameIndex(i);
                }
              }}
              title={`Frame ${i + 1}: ${Math.round(f.bodyVisibility * 100)}% visibility`}
            />
          ))}
        </div>
      )}

      {/* Step event timeline */}
      {!isCaregiver && trace.stepEvents.length > 0 && (
        <div className="relative h-7 rounded-full bg-muted/20">
          {trace.stepEvents.map((step, i) => {
            const pct =
              trace.videoMeta.durationMs > 0
                ? (step.timestampMs / trace.videoMeta.durationMs) * 100
                : 0;
            return (
              <div
                key={i}
                className="absolute top-0 h-7 w-4 rounded-sm cursor-pointer hover:scale-110 transition-transform"
                style={{
                  left: `${pct}%`,
                  backgroundColor: step.side === "left" ? TRACE_COLORS.leftSide : TRACE_COLORS.rightSide,
                  transform: "translateX(-50%)",
                }}
                title={`${step.side === "left" ? "L" : "R"} step at ${(step.timestampMs / 1000).toFixed(2)}s`}
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.pause();
                    setIsPlaying(false);
                    videoRef.current.currentTime = step.timestampMs / 1000;
                    setCurrentFrameIndex(step.frameIndex);
                  }
                }}
              />
            );
          })}
          <div className="absolute -bottom-5 left-0 flex gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: TRACE_COLORS.leftSide }} />
              L steps ({trace.pipeline.leftSteps})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: TRACE_COLORS.rightSide }} />
              R steps ({trace.pipeline.rightSteps})
            </span>
          </div>
        </div>
      )}

      {/* Playback controls */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
        <Button
          variant="ghost"
          size="icon-lg"
          className="touch-target"
          onClick={() => (isCaregiver ? jumpToAdjacentKeyMoment(-1) : stepFrame(-1))}
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon-lg" className="touch-target" onClick={togglePlay}>
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          className="touch-target"
          onClick={() => (isCaregiver ? jumpToAdjacentKeyMoment(1) : stepFrame(1))}
        >
          <SkipForward className="h-4 w-4" />
        </Button>
        {!isCaregiver && (
          <Button variant="outline" size="sm" className="touch-target text-xs font-semibold" onClick={cycleSpeed}>
            <Rewind className="mr-1 h-3 w-3" />
            {speed}x
          </Button>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {isCaregiver
          ? "Use play and arrow buttons to move between key moments."
          : "Tap colored markers to jump to specific moments in the clip."}
      </p>

      {canShowAdvancedControls && (
        <details className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-foreground">
            Advanced overlay controls
          </summary>

          <div className="mt-3 space-y-3">
            <Button
              variant="ghost"
              size="sm"
              className={`touch-target text-xs font-semibold ${
                renderMode === 'debug' ? "text-orange-500" : "text-muted-foreground"
              }`}
              onClick={toggleMode}
            >
              {renderMode === 'clean' ? (
                <><Eye className="mr-1 h-3 w-3" /> Switch to advanced view</>
              ) : (
                <><Bug className="mr-1 h-3 w-3" /> Return to caregiver view</>
              )}
            </Button>

            {renderMode === "debug" && (
              <>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(Object.keys(OVERLAY_LAYER_LABELS) as OverlayLayer[]).map((layer) => (
                    <button
                      key={layer}
                      onClick={() => toggleLayer(layer)}
                      className={`rounded-full border px-2 py-1 text-[11px] transition-colors ${
                        activeLayers.has(layer)
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "bg-muted/20 text-muted-foreground border-border/30 hover:bg-muted/40"
                      }`}
                    >
                      {OVERLAY_LAYER_LABELS[layer]}
                    </button>
                  ))}
                </div>

                <div className="grid gap-2 rounded-xl border border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground sm:grid-cols-2">
                  <p>videoWidth: {videoDims.width || trace.videoMeta.width}</p>
                  <p>videoHeight: {videoDims.height || trace.videoMeta.height}</p>
                  <p>canvasBacking: {canvasMetrics.backingWidth} x {canvasMetrics.backingHeight}</p>
                  <p>canvasCss: {canvasMetrics.cssWidth} x {canvasMetrics.cssHeight}</p>
                  <p>devicePixelRatio: {canvasMetrics.devicePixelRatio}</p>
                  <p>objectFit: contain</p>
                  <p>frameIndex: {currentFrameIndex}</p>
                  <p>timestamp: {currentFrame?.timestampMs ?? 0} ms</p>
                  <p>overlayTimestampSource: nearest_trace_frame</p>
                  <p>currentEvent: {currentEvent ? `${currentEvent.side}-${currentEvent.frameIndex}` : "none"}</p>
                </div>
              </>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
