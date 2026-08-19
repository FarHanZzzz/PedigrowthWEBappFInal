"use client";

// GAITBRIDGE — Analysis Trace Panel
// "How it was detected" — pipeline stages, frame stats, metric evidence.

import { useState } from "react";
import {
  ChevronDown,
  Eye,
  Footprints,
  BarChart3,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AnalysisTrace } from "@/lib/trace/traceTypes";
import type { ConcernEvidence } from "@/lib/trace/summarizeDetectionPath";
import { CONCERN_BADGE_STYLES, toConcernLevel } from "@/lib/presentation/severity";

interface Props {
  trace: AnalysisTrace;
  concernEvidence: ConcernEvidence[];
}

export default function AnalysisTracePanel({ trace, concernEvidence }: Props) {
  const [openSection, setOpenSection] = useState<string | null>("pipeline");
  const p = trace.pipeline;

  const toggle = (section: string) =>
    setOpenSection(openSection === section ? null : section);

  return (
    <div className="space-y-3">
      {/* Pipeline Summary */}
      <Card>
        <CardHeader
          className="pb-0 cursor-pointer"
          onClick={() => toggle("pipeline")}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Analysis summary
            </CardTitle>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                openSection === "pipeline" ? "rotate-180" : ""
              }`}
            />
          </div>
        </CardHeader>
        {openSection === "pipeline" && (
          <CardContent className="pt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Total frames" value={p.totalFrames.toString()} />
              <Stat
                label="Clear video moments used"
                value={`${p.usableFrames} (${Math.round(p.usableFramePct * 100)}%)`}
                warn={p.usableFramePct < 0.5}
              />
              <Stat label="Detected steps" value={p.detectedSteps.toString()} />
              <Stat
                label="L / R steps"
                value={`${p.leftSteps} / ${p.rightSteps}`}
              />
              <Stat
                label="Left and right leg tracking"
                value={p.lrTrackingStable ? "Stable" : "Unstable"}
                warn={!p.lrTrackingStable}
              />
              <Stat
                label="Result confidence level"
                value={p.assessmentMode.replace("_", " ")}
              />
              <Stat
                label="Confidence adjustment based on video quality"
                value={`${(p.confidenceMultiplier * 100).toFixed(0)}%`}
                warn={p.confidenceMultiplier < 0.7}
              />
              <Stat
                label="Direction"
                value={p.direction}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Computed Metrics */}
      <Card>
        <CardHeader
          className="pb-0 cursor-pointer"
          onClick={() => toggle("computed")}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Measured movement signals ({p.computedMetrics.length})
            </CardTitle>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                openSection === "computed" ? "rotate-180" : ""
              }`}
            />
          </div>
        </CardHeader>
        {openSection === "computed" && (
          <CardContent className="pt-3">
            <div className="space-y-2">
              {Object.values(trace.metricSources).map((source) => (
                <div
                  key={source.metricName}
                  className="border border-border/30 rounded-lg p-2.5"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">
                      {source.displayName}
                    </span>
                    <span className="text-sm tabular-nums font-mono">
                      {source.finalValue.toFixed(3)}
                      {source.unit && (
                        <span className="text-muted-foreground ml-0.5">
                          {source.unit}
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {source.inputSignal}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {source.computationMethod}
                  </p>
                  <div className="flex gap-2 mt-1">
                    <Badge
                      variant="secondary"
                      className="text-[9px] h-4"
                    >
                      {source.frameCount} frames
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={`text-[9px] h-4 ${
                        source.confidence < 0.4
                          ? "text-amber-600"
                          : ""
                      }`}
                    >
                      {Math.round(source.confidence * 100)}% confidence
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Suppressed Metrics */}
      {trace.suppressedMetrics.length > 0 && (
        <Card className="bg-muted/20">
          <CardHeader
            className="pb-0 cursor-pointer"
            onClick={() => toggle("suppressed")}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                <XCircle className="h-4 w-4" />
                Areas we could not evaluate clearly ({trace.suppressedMetrics.length})
              </CardTitle>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  openSection === "suppressed" ? "rotate-180" : ""
                }`}
              />
            </div>
          </CardHeader>
          {openSection === "suppressed" && (
            <CardContent className="pt-3 space-y-2">
              {trace.suppressedMetrics.map((s) => (
                <div
                  key={s.metricName}
                  className="text-sm text-muted-foreground"
                >
                  <p className="font-medium text-foreground/70">
                    {s.displayName}
                  </p>
                  <p>{s.reason}</p>
                  <p className="text-xs">
                    Had {s.availableFrames} frames, needed{" "}
                    {s.requiredFrames}
                  </p>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Concern Evidence */}
      <Card>
        <CardHeader
          className="pb-0 cursor-pointer"
          onClick={() => toggle("evidence")}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Footprints className="h-4 w-4" />
              Why this result was shown
            </CardTitle>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                openSection === "evidence" ? "rotate-180" : ""
              }`}
            />
          </div>
        </CardHeader>
        {openSection === "evidence" && (
          <CardContent className="pt-3 space-y-3">
            {concernEvidence.map((ev) => {
              const concernLevel = toConcernLevel(ev.level);

              return (
                <div
                  key={ev.domain}
                  className="border border-border/30 rounded-lg p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {ev.displayName}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] ${CONCERN_BADGE_STYLES[concernLevel]}`}
                    >
                      {concernLevel}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground/80">
                    {ev.explanation}
                  </p>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>Signal: {ev.signalDescription}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>Frames: {ev.frameRange}</span>
                    <span>·</span>
                    <span>{ev.frameCount} frames used</span>
                    <span>·</span>
                    <span>
                      {Math.round(ev.confidence * 100)}% confidence
                    </span>
                  </div>
                  {ev.missingInfo && (
                    <p className="mt-1 flex items-start gap-1 text-xs text-amber-600">
                      <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                      {ev.missingInfo}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        )}
      </Card>

      {/* Step Events Table */}
      {trace.stepEvents.length > 0 && (
        <Card>
          <CardHeader
            className="pb-0 cursor-pointer"
            onClick={() => toggle("steps")}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Footprints className="h-4 w-4" />
                Step Events ({trace.stepEvents.length})
              </CardTitle>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  openSection === "steps" ? "rotate-180" : ""
                }`}
              />
            </div>
          </CardHeader>
          {openSection === "steps" && (
            <CardContent className="pt-3">
              <div className="mb-1 grid grid-cols-4 gap-1 text-xs font-medium text-muted-foreground">
                <span>#</span>
                <span>Side</span>
                <span>Frame</span>
                <span>Time</span>
              </div>
              {trace.stepEvents.map((step, i) => (
                <div
                  key={i}
                  className="grid grid-cols-4 gap-1 py-0.5 text-xs"
                >
                  <span className="tabular-nums">{i + 1}</span>
                  <span
                    className="font-medium"
                    style={{
                      color:
                        step.side === "left" ? "#3B82F6" : "#EF4444",
                    }}
                  >
                    {step.side === "left" ? "L" : "R"}
                  </span>
                  <span className="tabular-nums">
                    {step.frameIndex + 1}
                  </span>
                  <span className="tabular-nums">
                    {(step.timestampMs / 1000).toFixed(2)}s
                  </span>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-sm font-medium tabular-nums ${
          warn ? "text-amber-600" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
