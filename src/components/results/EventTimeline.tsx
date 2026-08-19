"use client";

import { Footprints } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalysisTrace } from "@/lib/trace/traceTypes";
import { TRACE_COLORS } from "@/lib/trace/traceTypes";

interface Props {
  trace: AnalysisTrace;
  onJumpToFrame?: (frameIndex: number) => void;
}

export default function EventTimeline({ trace, onJumpToFrame }: Props) {
  if (trace.stepEvents.length === 0) {
    return null;
  }

  const durationMs = Math.max(trace.videoMeta.durationMs, trace.frames.at(-1)?.timestampMs ?? 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Footprints className="h-4 w-4" />
          Step timeline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative h-12 rounded-full bg-muted/40 px-3">
          <div className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-border" />
          {trace.stepEvents.map((event) => {
            const leftPct = (event.timestampMs / durationMs) * 100;
            const color =
              event.side === "left" ? TRACE_COLORS.leftSide : TRACE_COLORS.rightSide;
            return (
              <button
                key={`${event.side}-${event.frameIndex}-${event.timestampMs}`}
                type="button"
                onClick={() => onJumpToFrame?.(event.frameIndex)}
                className="touch-target absolute top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-background text-xs font-semibold shadow-sm"
                style={{
                  left: `calc(${leftPct}% - 0px)`,
                  borderColor: color,
                  color,
                }}
                title={`${event.side.toUpperCase()} step at ${(event.timestampMs / 1000).toFixed(2)}s`}
              >
                {event.side === "left" ? "L" : "R"}
              </button>
            );
          })}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {trace.stepEvents.map((event) => (
            <button
              key={`row-${event.side}-${event.frameIndex}-${event.timestampMs}`}
              type="button"
              onClick={() => onJumpToFrame?.(event.frameIndex)}
              className="touch-target flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5 text-left text-sm hover:bg-muted/30"
            >
              <span className="font-medium">
                {event.side === "left" ? "L-step" : "R-step"}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {(event.timestampMs / 1000).toFixed(2)}s · {Math.round(event.confidence * 100)}%
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
