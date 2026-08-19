"use client";

import { Camera, Footprints, LineChart, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalysisSessionResult } from "@/lib/session/analysisSession";

interface Props {
  result: AnalysisSessionResult;
}

const STEPS = [
  {
    icon: Camera,
    title: "1. Video",
    body: "We start with one front-view walking clip and check whether enough of the body is visible to trust the analysis.",
  },
  {
    icon: LineChart,
    title: "2. Tracking",
    body: "The pose model tracks shoulders, hips, knees, ankles, and foot landmarks frame by frame.",
  },
  {
    icon: Footprints,
    title: "3. Events",
    body: "We identify step events and derive gait metrics from the stable parts of the motion sequence.",
  },
  {
    icon: ShieldCheck,
    title: "4. Summary",
    body: "We only summarize what the clip supports. Low-signal metrics stay suppressed instead of being guessed.",
  },
];

export default function HowAnalysisWorksPanel({ result }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">How Analysis Works</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((step) => (
            <div key={step.title} className="rounded-xl border border-border/50 bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <step.icon className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold">{step.title}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-green-200 bg-green-50/60 p-3">
            <p className="text-xs font-semibold text-green-800">What was assessed</p>
            <div className="mt-2 space-y-1">
              {result.concerns.assessedDomains.length > 0 ? (
                result.concerns.assessedDomains.map((domain) => (
                  <p key={domain} className="text-xs text-green-900/80">
                    • {domain.charAt(0).toUpperCase() + domain.slice(1).replace(/([A-Z])/g, " $1")}
                  </p>
                ))
              ) : (
                <p className="text-xs text-green-900/80">No movement domains were confidently assessed.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-xs font-semibold text-amber-800">What was not assessed</p>
            <div className="mt-2 space-y-1">
              {result.concerns.suppressedDomains.length > 0 ? (
                result.concerns.suppressedDomains.map((domain) => (
                  <p key={domain} className="text-xs text-amber-900/80">
                    • {domain.charAt(0).toUpperCase() + domain.slice(1).replace(/([A-Z])/g, " $1")}
                  </p>
                ))
              ) : (
                <p className="text-xs text-amber-900/80">No domains were suppressed for this run.</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-muted/20 p-3">
          <p className="text-xs font-semibold">Why confidence is {result.concerns.qualityWarning ? "limited" : "stronger"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{result.quality.confidenceNotes}</p>
          {result.trackingTelemetry && (
            <p className="mt-2 text-xs text-muted-foreground">
              This run detected landmarks in {Math.round(result.trackingTelemetry.detectionRate * 100)}% of sampled frames,
              with {Math.round(result.trackingTelemetry.visibleJointRatio * 100)}% average visible joints.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
