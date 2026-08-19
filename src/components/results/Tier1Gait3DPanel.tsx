"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Move3d, Pause, Play, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AnalysisTrace, FrameTrace, TraceLandmark } from "@/lib/trace/traceTypes";

interface Tier1Gait3DPanelProps {
  trace: AnalysisTrace;
  selectedFrameIndex?: number | null;
  onFrameSelect?: (frameIndex: number) => void;
  syncLocked?: boolean;
}

type Point3 = { x: number; y: number; z: number; visibility: number };
type Point2 = { x: number; y: number; visibility: number };

const SKELETON_EDGES: Array<[string, string]> = [
  ["nose", "leftShoulder"],
  ["nose", "rightShoulder"],
  ["leftShoulder", "rightShoulder"],
  ["leftShoulder", "leftHip"],
  ["rightShoulder", "rightHip"],
  ["leftHip", "rightHip"],
  ["leftHip", "leftKnee"],
  ["rightHip", "rightKnee"],
  ["leftKnee", "leftAnkle"],
  ["rightKnee", "rightAnkle"],
  ["leftAnkle", "leftHeel"],
  ["rightAnkle", "rightHeel"],
  ["leftAnkle", "leftFoot"],
  ["rightAnkle", "rightFoot"],
];

const MIN_VISIBILITY = 0.12;
const MIN_USABLE_VISIBILITY = 0.12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findLandmark(frame: FrameTrace, name: string): TraceLandmark | undefined {
  return frame.landmarks.find((lm) => lm.name === name);
}

function hasUsableLandmarkSignal(frame: FrameTrace): boolean {
  if (frame.bodyVisibility >= MIN_USABLE_VISIBILITY) {
    return true;
  }

  return frame.landmarks.some((lm) => lm.visibility >= MIN_USABLE_VISIBILITY);
}

function findNearestFrameIndex(targetIndex: number, candidates: number[]): number {
  let best = candidates[0];
  let bestDistance = Math.abs(candidates[0] - targetIndex);

  for (let i = 1; i < candidates.length; i += 1) {
    const distance = Math.abs(candidates[i] - targetIndex);
    if (distance < bestDistance) {
      best = candidates[i];
      bestDistance = distance;
    }
  }

  return best;
}

function toLocal3D(frame: FrameTrace): Map<string, Point3> {
  const leftHip = findLandmark(frame, "leftHip");
  const rightHip = findLandmark(frame, "rightHip");

  const centerX =
    leftHip && rightHip ? (leftHip.x + rightHip.x) / 2 : 0.5;
  const centerY =
    leftHip && rightHip ? (leftHip.y + rightHip.y) / 2 : 0.5;
  const centerZ =
    leftHip && rightHip ? (leftHip.z + rightHip.z) / 2 : 0;

  const result = new Map<string, Point3>();

  for (const lm of frame.landmarks) {
    result.set(lm.name, {
      x: lm.x - centerX,
      y: centerY - lm.y,
      z: lm.z - centerZ,
      visibility: lm.visibility,
    });
  }

  return result;
}

function projectPoint(point: Point3, yawRad: number, width: number, height: number, scaleBase: number): Point2 {
  const cos = Math.cos(yawRad);
  const sin = Math.sin(yawRad);

  const rx = point.x * cos + point.z * sin;
  const rz = -point.x * sin + point.z * cos;

  const perspective = clamp(1 - rz * 1.2, 0.55, 1.35);
  const x = width / 2 + rx * scaleBase * perspective;
  const y = height / 2 - point.y * scaleBase * perspective;

  return { x, y, visibility: point.visibility };
}

function colorForVisibility(visibility: number): string {
  const v = clamp(visibility, 0, 1);
  const hue = Math.round(v * 120); // 0 red -> 120 green
  return `hsl(${hue} 78% 52%)`;
}

export default function Tier1Gait3DPanel({
  trace,
  selectedFrameIndex = null,
  onFrameSelect,
  syncLocked = false,
}: Tier1Gait3DPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotateRafRef = useRef<number | null>(null);
  const playIntervalRef = useRef<number | null>(null);
  const frameIndexRef = useRef(0);

  const [frameIndex, setFrameIndex] = useState(0);
  const [yawDeg, setYawDeg] = useState(18);
  const [isAutoRotate, setIsAutoRotate] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);

  const totalFrames = trace.frames.length;
  const desiredFrameIndex =
    selectedFrameIndex === null || selectedFrameIndex === undefined
      ? frameIndex
      : clamp(Math.round(selectedFrameIndex), 0, Math.max(totalFrames - 1, 0));

  const usableFrameIndices = useMemo(
    () =>
      trace.frames
        .map((frame, index) => (hasUsableLandmarkSignal(frame) ? index : -1))
        .filter((index) => index >= 0),
    [trace.frames],
  );

  useEffect(() => {
    if (selectedFrameIndex !== null && selectedFrameIndex !== undefined) {
      return;
    }

    if (totalFrames === 0 || usableFrameIndices.length === 0) {
      return;
    }

    if (!hasUsableLandmarkSignal(trace.frames[frameIndex])) {
      // Start local controls on a frame with visible signal to avoid blank first render.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time corrective initialization to first usable frame.
      setFrameIndex(usableFrameIndices[0]);
    }
  }, [frameIndex, selectedFrameIndex, totalFrames, trace.frames, usableFrameIndices]);

  const renderFrameIndex = useMemo(() => {
    if (totalFrames === 0 || usableFrameIndices.length === 0) {
      return null;
    }

    if (usableFrameIndices.includes(desiredFrameIndex)) {
      return desiredFrameIndex;
    }

    return findNearestFrameIndex(desiredFrameIndex, usableFrameIndices);
  }, [desiredFrameIndex, totalFrames, usableFrameIndices]);

  const currentFrame = renderFrameIndex === null ? null : trace.frames[renderFrameIndex];
  const requestedFrame = totalFrames > 0 ? trace.frames[desiredFrameIndex] : null;
  const isFallbackFrame =
    renderFrameIndex !== null &&
    renderFrameIndex !== desiredFrameIndex;

  const fps = useMemo(() => {
    const rawFps = trace.videoMeta.fps;
    if (!Number.isFinite(rawFps) || rawFps <= 0) {
      return 10;
    }
    return clamp(rawFps, 6, 30);
  }, [trace.videoMeta.fps]);

  useEffect(() => {
    frameIndexRef.current = frameIndex;
  }, [frameIndex]);

  useEffect(() => {
    if (!isAutoRotate) {
      if (rotateRafRef.current) {
        cancelAnimationFrame(rotateRafRef.current);
        rotateRafRef.current = null;
      }
      return;
    }

    const step = () => {
      setYawDeg((prev) => (prev + 0.5) % 360);
      rotateRafRef.current = requestAnimationFrame(step);
    };

    rotateRafRef.current = requestAnimationFrame(step);

    return () => {
      if (rotateRafRef.current) {
        cancelAnimationFrame(rotateRafRef.current);
        rotateRafRef.current = null;
      }
    };
  }, [isAutoRotate]);

  useEffect(() => {
    if (!isPlaying || totalFrames === 0 || syncLocked) {
      if (playIntervalRef.current !== null) {
        window.clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      return;
    }

    const tickMs = Math.round(1000 / fps);
    playIntervalRef.current = window.setInterval(() => {
      const next = (frameIndexRef.current + 1) % totalFrames;
      frameIndexRef.current = next;
      setFrameIndex(next);
      onFrameSelect?.(next);
    }, tickMs);

    return () => {
      if (playIntervalRef.current !== null) {
        window.clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [fps, isPlaying, onFrameSelect, syncLocked, totalFrames]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentFrame) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    const width = Math.max(1, Math.floor(cssWidth * dpr));
    const height = Math.max(1, Math.floor(cssHeight * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    ctx.fillStyle = "#070b16";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Reference grid for depth orientation
    ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const y = (cssHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(16, y);
      ctx.lineTo(cssWidth - 16, y);
      ctx.stroke();
    }

    const local = toLocal3D(currentFrame);

    let maxExtent = 0.2;
    for (const point of local.values()) {
      if (point.visibility < MIN_VISIBILITY) {
        continue;
      }
      maxExtent = Math.max(maxExtent, Math.abs(point.x), Math.abs(point.y), Math.abs(point.z));
    }

    const scaleBase = (Math.min(cssWidth, cssHeight) * 0.42) / maxExtent;
    const yawRad = (yawDeg * Math.PI) / 180;

    const projected = new Map<string, Point2>();
    for (const [name, point] of local.entries()) {
      projected.set(name, projectPoint(point, yawRad, cssWidth, cssHeight, scaleBase));
    }

    // Draw edges first
    for (const [a, b] of SKELETON_EDGES) {
      const pa = projected.get(a);
      const pb = projected.get(b);
      if (!pa || !pb) {
        continue;
      }
      const segVisibility = Math.min(pa.visibility, pb.visibility);
      if (segVisibility < MIN_VISIBILITY) {
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.lineWidth = segVisibility >= 0.6 ? 3 : 2;
      ctx.strokeStyle = colorForVisibility((pa.visibility + pb.visibility) / 2);
      ctx.globalAlpha = clamp(0.45 + segVisibility * 0.55, 0.45, 1);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Draw joints
    for (const point of projected.values()) {
      if (point.visibility < MIN_VISIBILITY) {
        continue;
      }
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.visibility >= 0.6 ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = colorForVisibility(point.visibility);
      ctx.fill();
    }

    // Legend
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = "12px ui-sans-serif, system-ui, -apple-system";
    ctx.fillText("Tier 1 3D view from run landmarks", 14, 20);
    ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
    const displayedFrameIndex = renderFrameIndex ?? desiredFrameIndex;
    ctx.fillText(`Frame ${displayedFrameIndex + 1}/${totalFrames}  |  yaw ${Math.round(yawDeg)} deg`, 14, 38);
  }, [currentFrame, desiredFrameIndex, renderFrameIndex, totalFrames, yawDeg]);

  const frameTimeSec = currentFrame ? (currentFrame.timestampMs / 1000).toFixed(2) : "0.00";
  const frameUsability = currentFrame ? Math.round(currentFrame.bodyVisibility * 100) : 0;
  const requestedFrameUsability = requestedFrame ? Math.round(requestedFrame.bodyVisibility * 100) : 0;

  function handleExportSnapshot() {
    const canvas = canvasRef.current;
    if (!canvas) {
      setSnapshotMessage("Snapshot export is unavailable right now.");
      return;
    }

    try {
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      const exportFrameIndex = renderFrameIndex ?? desiredFrameIndex;
      link.download = `tier1-3d-${trace.sessionId}-frame-${exportFrameIndex + 1}.png`;
      link.click();
      setSnapshotMessage("Snapshot exported as PNG.");
    } catch {
      setSnapshotMessage("Snapshot export failed for this browser context.");
    }
  }

  useEffect(() => {
    if (!snapshotMessage) return;
    const timer = window.setTimeout(() => setSnapshotMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [snapshotMessage]);

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tier 1 3D Movement View</p>
          <p className="text-xs text-muted-foreground">
            Rendered directly from this run&apos;s landmark trace and synced to frame timestamps.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] text-muted-foreground">
          <Move3d className="h-3.5 w-3.5" />
          Experimental
        </span>
      </div>

      {totalFrames === 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-900">
          No trace frame is available for 3D rendering.
        </div>
      ) : usableFrameIndices.length === 0 ? (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-900">
          <p>No usable landmark signal was detected in this clip for Tier 1 3D rendering.</p>
          <p>
            Current synced frame usability is {requestedFrameUsability}%. Try a clearer clip or re-run analysis with better visibility.
          </p>
        </div>
      ) : !currentFrame ? (
        <div className="rounded-md border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-900">
          Tier 1 3D could not resolve a renderable frame.
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-md border bg-black/95">
            <canvas ref={canvasRef} className="h-80 w-full" />
          </div>

          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            <div className="rounded-md bg-muted/40 px-2 py-1.5">Timestamp: {frameTimeSec}s</div>
            <div className="rounded-md bg-muted/40 px-2 py-1.5">Frame usability: {frameUsability}%</div>
            <div className="rounded-md bg-muted/40 px-2 py-1.5">Trace source: real run landmarks</div>
          </div>

          <div className="mt-2 rounded-md border bg-muted/15 p-2.5">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Confidence legend</p>
            <div className="h-2 rounded-full bg-linear-to-r from-red-500 via-amber-400 to-emerald-500" />
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>Low visibility</span>
              <span>Medium</span>
              <span>High visibility</span>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setIsPlaying((prev) => !prev)}
                className="gap-1.5"
                disabled={syncLocked}
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {isPlaying ? "Pause" : "Play"}
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setIsAutoRotate((prev) => !prev)}
                className="gap-1.5"
                disabled={syncLocked}
              >
                <RotateCw className="h-3.5 w-3.5" />
                {isAutoRotate ? "Stop Rotate" : "Auto Rotate"}
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleExportSnapshot}
                className="gap-1.5"
              >
                <Camera className="h-3.5 w-3.5" />
                Export snapshot
              </Button>
            </div>

            {syncLocked && (
              <p className="text-[11px] text-muted-foreground">
                Frame sync lock is on. This 3D view follows the annotated video timeline.
              </p>
            )}

            {isFallbackFrame && (
              <p className="text-[11px] text-muted-foreground">
                Synced frame {desiredFrameIndex + 1} had low landmark signal ({requestedFrameUsability}% usability).
                Showing nearest usable frame {(renderFrameIndex ?? desiredFrameIndex) + 1} instead.
              </p>
            )}

            {snapshotMessage && (
              <p className="text-[11px] text-primary">{snapshotMessage}</p>
            )}

            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground" htmlFor="tier1-frame-scrub">
                Frame scrub
              </label>
              <input
                id="tier1-frame-scrub"
                type="range"
                min={0}
                max={Math.max(totalFrames - 1, 0)}
                value={desiredFrameIndex}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  frameIndexRef.current = next;
                  setFrameIndex(next);
                  onFrameSelect?.(next);
                }}
                className="w-full"
                disabled={syncLocked}
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground" htmlFor="tier1-yaw-scrub">
                Camera yaw
              </label>
              <input
                id="tier1-yaw-scrub"
                type="range"
                min={-180}
                max={180}
                value={Math.round(yawDeg)}
                onChange={(event) => setYawDeg(Number(event.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50/70 p-2.5 text-[11px] text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              This 3D view is an interpretive visualization from monocular landmark depth. It is useful for communication and trend review,
              not a replacement for instrumented 3D gait-lab kinematics.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
