// PEDI-GROWTH — Canvas Overlay Renderer (v2 — Annotation Quality Recovery)
//
// Pure 2D canvas drawing functions for annotation overlays.
// No component logic — just draw functions that take a canvas context + trace data.
//
// CHANGES FROM v1:
// 1. Proper coordinate transform with object-fit offset calculation
// 2. Two rendering modes: CLEAN (demo-safe) and DEBUG (developer)
// 3. Confidence-scaled opacity — entire overlay fades on low-quality frames
// 4. Anti-aliased lines with proper line caps
// 5. Low-confidence landmarks hidden (not drawn ghost-style)
// 6. Professional step-marker design with drop shadow

import type {
  FrameTrace,
  StepEvent,
  OverlayLayer,
  TracePoint,
} from '@/lib/trace/traceTypes';
import { TRACE_COLORS } from '@/lib/trace/traceTypes';
import { MIN_VISIBILITY } from '@/lib/pose/poseTypes';

// ── Coordinate transform ────────────────────────────────────────

/**
 * Compute the transform from MediaPipe normalized [0,1] coords
 * to canvas pixel coordinates, accounting for object-fit: contain
 * letterboxing.
 *
 * MediaPipe landmarks are normalized to [0,1] relative to the video's
 * native resolution. When the <video> element uses object-fit: contain,
 * the rendered video may have letterbox bars (black bars on top/bottom
 * or left/right). This function computes the offset and scale.
 */
export interface VideoTransform {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}

export function computeVideoTransform(
  videoNativeWidth: number,
  videoNativeHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): VideoTransform {
  // Video aspect ratio vs canvas aspect ratio
  const videoAR = videoNativeWidth / videoNativeHeight;
  const canvasAR = canvasWidth / canvasHeight;

  let renderWidth: number;
  let renderHeight: number;

  if (canvasAR > videoAR) {
    // Canvas is wider than video → letterbox on sides (pillarbox)
    renderHeight = canvasHeight;
    renderWidth = canvasHeight * videoAR;
  } else {
    // Canvas is taller than video → letterbox on top/bottom
    renderWidth = canvasWidth;
    renderHeight = canvasWidth / videoAR;
  }

  return {
    offsetX: (canvasWidth - renderWidth) / 2,
    offsetY: (canvasHeight - renderHeight) / 2,
    scaleX: renderWidth,
    scaleY: renderHeight,
  };
}

/** Convert a normalized [0,1] point to canvas pixels */
function toPixel(
  normX: number,
  normY: number,
  tx: VideoTransform,
): [number, number] {
  return [
    tx.offsetX + normX * tx.scaleX,
    tx.offsetY + normY * tx.scaleY,
  ];
}

// ── Skeleton connections ────────────────────────────────────────

const SKELETON_CONNECTIONS: [string, string][] = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['rightHip', 'rightKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightKnee', 'rightAnkle'],
  ['leftAnkle', 'leftHeel'],
  ['rightAnkle', 'rightHeel'],
  ['leftAnkle', 'leftFoot'],
  ['rightAnkle', 'rightFoot'],
  ['nose', 'leftShoulder'],
  ['nose', 'rightShoulder'],
];

// ── Main render function ────────────────────────────────────────

export type RenderMode = 'clean' | 'debug';

export function renderOverlay(
  ctx: CanvasRenderingContext2D,
  frame: FrameTrace,
  activeLayers: Set<OverlayLayer>,
  canvasWidth: number,
  canvasHeight: number,
  options: {
    stepEvents?: StepEvent[];
    currentFrameIndex?: number;
    ankleTrailHistory?: FrameTrace[];
    hipTrailHistory?: TracePoint[];
    videoNativeWidth?: number;
    videoNativeHeight?: number;
    mode?: RenderMode;
  } = {},
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  if (!frame.isUsable && frame.bodyVisibility < 0.15) return;

  // Compute proper coordinate transform
  const nativeW = options.videoNativeWidth || canvasWidth;
  const nativeH = options.videoNativeHeight || canvasHeight;
  const tx = computeVideoTransform(nativeW, nativeH, canvasWidth, canvasHeight);

  // Confidence-scaled global opacity: entire overlay fades on low-quality frames
  const frameAlpha = Math.max(0.3, Math.min(1.0, frame.bodyVisibility));
  ctx.globalAlpha = frameAlpha;

  // Anti-aliased rendering
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Build landmark lookup for this frame
  const lmMap = new Map<string, { x: number; y: number; visibility: number }>();
  for (const lm of frame.landmarks) {
    const [px, py] = toPixel(lm.x, lm.y, tx);
    lmMap.set(lm.name, { x: px, y: py, visibility: lm.visibility });
  }

  const isDebug = options.mode === 'debug';

  // ── CLEAN MODE LAYERS (minimal, professional) ──

  if (!isDebug) {
    if (activeLayers.has('pathCorridor') && options.hipTrailHistory && options.hipTrailHistory.length > 2) {
      drawPathCorridor(ctx, options.hipTrailHistory, tx);
    }
    drawSubjectCue(ctx, lmMap);
    drawLowerLimbChains(ctx, frame, tx);
    drawPelvisCenter(ctx, frame.hipMidpoint, tx);
  }

  // Layer: Hip line (dashed yellow)
  if (activeLayers.has('hipLine') && frame.leftHip && frame.rightHip) {
    const [lx, ly] = toPixel(frame.leftHip.x, frame.leftHip.y, tx);
    const [rx, ry] = toPixel(frame.rightHip.x, frame.rightHip.y, tx);
    drawDashedLine(ctx, lx, ly, rx, ry, TRACE_COLORS.hipLine, 2);
  }

  // Layer: Shoulder line (dashed cyan)
  if (activeLayers.has('shoulderLine') && frame.leftShoulder && frame.rightShoulder) {
    const [lx, ly] = toPixel(frame.leftShoulder.x, frame.leftShoulder.y, tx);
    const [rx, ry] = toPixel(frame.rightShoulder.x, frame.rightShoulder.y, tx);
    drawDashedLine(ctx, lx, ly, rx, ry, TRACE_COLORS.shoulderLine, 2);
  }

  // Layer: Body midline (nose → hip center)
  if (activeLayers.has('bodyMidline')) {
    const nose = lmMap.get('nose');
    if (nose && nose.visibility >= MIN_VISIBILITY && frame.hipMidpoint) {
      const [hx, hy] = toPixel(frame.hipMidpoint.x, frame.hipMidpoint.y, tx);
      ctx.beginPath();
      ctx.strokeStyle = TRACE_COLORS.midline;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.moveTo(nose.x, nose.y);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Layer: Foot endpoints (subtle tracking cue, not the main evidence)
  drawFootEndpoints(ctx, frame, tx);

  // Layer: Ankle trails (last N frames)
  if (activeLayers.has('ankleTrails') && options.ankleTrailHistory) {
    drawAnkleTrails(ctx, options.ankleTrailHistory, tx);
  }

  // Layer: Step markers
  if (activeLayers.has('stepMarkers') && options.stepEvents && options.currentFrameIndex !== undefined) {
    const currentStep = options.stepEvents.find(s => s.frameIndex === options.currentFrameIndex);
    if (currentStep) {
      const anklePos = currentStep.side === 'left' ? frame.leftAnkle : frame.rightAnkle;
      if (anklePos) {
        const [ax, ay] = toPixel(anklePos.x, anklePos.y, tx);
        drawStepMarker(ctx, ax, ay, currentStep.side);
      }
    }
  }

  // ── DEBUG MODE LAYERS (full diagnostics) ──

  if (isDebug && activeLayers.has('skeleton')) {
    drawSkeleton(ctx, lmMap);
    drawAllJointDots(ctx, lmMap);
  }

  // Layer: Path corridor (hip midpoint trail)
  if (isDebug && activeLayers.has('pathCorridor') && options.hipTrailHistory && options.hipTrailHistory.length > 2) {
    drawPathCorridor(ctx, options.hipTrailHistory, tx);
  }

  // Reset alpha
  ctx.globalAlpha = 1.0;
}

// ── Drawing primitives ──────────────────────────────────────────

function drawFootEndpoints(
  ctx: CanvasRenderingContext2D,
  frame: FrameTrace,
  tx: VideoTransform,
): void {
  const pairs = [
    { ankle: frame.leftAnkle, heel: frame.leftHeel, color: TRACE_COLORS.leftSide },
    { ankle: frame.rightAnkle, heel: frame.rightHeel, color: TRACE_COLORS.rightSide },
  ];

  for (const pair of pairs) {
    if (!pair.ankle) continue;
    const [ax, ay] = toPixel(pair.ankle.x, pair.ankle.y, tx);
    ctx.beginPath();
    ctx.fillStyle = pair.color;
    ctx.arc(ax, ay, 3, 0, Math.PI * 2);
    ctx.fill();

    if (pair.heel) {
      const [hx, hy] = toPixel(pair.heel.x, pair.heel.y, tx);
      ctx.beginPath();
      ctx.strokeStyle = pair.color;
      ctx.lineWidth = 2;
      ctx.moveTo(ax, ay);
      ctx.lineTo(hx, hy);
      ctx.stroke();
    }
  }
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  lmMap: Map<string, { x: number; y: number; visibility: number }>,
): void {
  for (const [a, b] of SKELETON_CONNECTIONS) {
    const lmA = lmMap.get(a);
    const lmB = lmMap.get(b);
    if (!lmA || !lmB) continue;

    const minVis = Math.min(lmA.visibility, lmB.visibility);
    if (minVis < 0.15) continue;

    ctx.beginPath();
    ctx.strokeStyle = minVis >= MIN_VISIBILITY
      ? TRACE_COLORS.skeleton
      : TRACE_COLORS.skeletonLowConf;
    ctx.lineWidth = minVis >= MIN_VISIBILITY ? 2 : 1;
    ctx.moveTo(lmA.x, lmA.y);
    ctx.lineTo(lmB.x, lmB.y);
    ctx.stroke();
  }
}

function drawAllJointDots(
  ctx: CanvasRenderingContext2D,
  lmMap: Map<string, { x: number; y: number; visibility: number }>,
): void {
  const joints = ['leftKnee', 'rightKnee', 'leftHip', 'rightHip', 'leftShoulder', 'rightShoulder', 'nose'];
  for (const name of joints) {
    const lm = lmMap.get(name);
    if (!lm || lm.visibility < MIN_VISIBILITY) continue;

    ctx.beginPath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.arc(lm.x, lm.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  color: string,
  lineWidth: number,
): void {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([8, 4]);
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawStepMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  side: 'left' | 'right',
): void {
  const color = side === 'left' ? TRACE_COLORS.stepMarkerL : TRACE_COLORS.stepMarkerR;
  const label = side === 'left' ? 'L' : 'R';

  const pillW = 26;
  const pillH = 18;
  const pillX = x - pillW / 2;
  const pillY = y - pillH - 14;

  // Drop shadow
  ctx.beginPath();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.roundRect(pillX + 1, pillY + 1, pillW, pillH, 9);
  ctx.fill();

  // Pill background
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.roundRect(pillX, pillY, pillW, pillH, 9);
  ctx.fill();

  // White border
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.roundRect(pillX, pillY, pillW, pillH, 9);
  ctx.stroke();

  // Text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, pillY + pillH / 2);
}

function drawSubjectCue(
  ctx: CanvasRenderingContext2D,
  lmMap: Map<string, { x: number; y: number; visibility: number }>,
): void {
  const focusPoints = ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle']
    .map((name) => lmMap.get(name))
    .filter((point): point is { x: number; y: number; visibility: number } => Boolean(point && point.visibility >= 0.2));

  if (focusPoints.length < 4) return;

  const minX = Math.min(...focusPoints.map((p) => p.x));
  const maxX = Math.max(...focusPoints.map((p) => p.x));
  const minY = Math.min(...focusPoints.map((p) => p.y));
  const maxY = Math.max(...focusPoints.map((p) => p.y));
  const padX = 18;
  const padY = 16;

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.roundRect(minX - padX, minY - padY, maxX - minX + padX * 2, maxY - minY + padY * 2, 18);
  ctx.stroke();
}

function drawPelvisCenter(
  ctx: CanvasRenderingContext2D,
  hipMidpoint: TracePoint | undefined,
  tx: VideoTransform,
): void {
  if (!hipMidpoint) return;
  const [x, y] = toPixel(hipMidpoint.x, hipMidpoint.y, tx);
  ctx.beginPath();
  ctx.fillStyle = '#FFFFFF';
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.arc(x, y, 6.5, 0, Math.PI * 2);
  ctx.stroke();
}

function drawLowerLimbChains(
  ctx: CanvasRenderingContext2D,
  frame: FrameTrace,
  tx: VideoTransform,
): void {
  drawChain(ctx, [frame.leftHip, frame.leftKnee, frame.leftAnkle], TRACE_COLORS.leftSide, tx);
  drawChain(ctx, [frame.rightHip, frame.rightKnee, frame.rightAnkle], TRACE_COLORS.rightSide, tx);
}

function drawChain(
  ctx: CanvasRenderingContext2D,
  points: Array<TracePoint | undefined>,
  color: string,
  tx: VideoTransform,
): void {
  const usable = points.filter((point): point is TracePoint => Boolean(point));
  if (usable.length < 2) return;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  const [sx, sy] = toPixel(usable[0].x, usable[0].y, tx);
  ctx.moveTo(sx, sy);
  for (let i = 1; i < usable.length; i++) {
    const [px, py] = toPixel(usable[i].x, usable[i].y, tx);
    ctx.lineTo(px, py);
  }
  ctx.stroke();

  for (const point of usable) {
    const [px, py] = toPixel(point.x, point.y, tx);
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAnkleTrails(
  ctx: CanvasRenderingContext2D,
  history: FrameTrace[],
  tx: VideoTransform,
): void {
  const maxTrail = 8;
  const recent = history.slice(-maxTrail);

  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1];
    const curr = recent[i];
    const alpha = (i / recent.length) * 0.5;

    // Left ankle trail
    if (prev.leftAnkle && curr.leftAnkle) {
      const [px, py] = toPixel(prev.leftAnkle.x, prev.leftAnkle.y, tx);
      const [cx, cy] = toPixel(curr.leftAnkle.x, curr.leftAnkle.y, tx);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.moveTo(px, py);
      ctx.lineTo(cx, cy);
      ctx.stroke();
    }

    // Right ankle trail
    if (prev.rightAnkle && curr.rightAnkle) {
      const [px, py] = toPixel(prev.rightAnkle.x, prev.rightAnkle.y, tx);
      const [cx, cy] = toPixel(curr.rightAnkle.x, curr.rightAnkle.y, tx);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.moveTo(px, py);
      ctx.lineTo(cx, cy);
      ctx.stroke();
    }
  }
}

function drawPathCorridor(
  ctx: CanvasRenderingContext2D,
  hipTrail: TracePoint[],
  tx: VideoTransform,
): void {
  if (hipTrail.length < 3) return;

  ctx.beginPath();
  ctx.strokeStyle = TRACE_COLORS.pathCorridor;
  ctx.lineWidth = 3;
  const [sx, sy] = toPixel(hipTrail[0].x, hipTrail[0].y, tx);
  ctx.moveTo(sx, sy);

  for (let i = 1; i < hipTrail.length; i++) {
    const [px, py] = toPixel(hipTrail[i].x, hipTrail[i].y, tx);
    ctx.lineTo(px, py);
  }
  ctx.stroke();
}
