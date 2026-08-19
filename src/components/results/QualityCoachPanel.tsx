"use client";

import { useMemo, useState } from "react";
import { Camera, CheckCircle2, CircleAlert, CircleCheckBig } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AnalysisSessionResult } from "@/lib/session/analysisSession";

interface Props {
  result: AnalysisSessionResult;
  onRecordAgain: () => void;
}

interface SuppressionReason {
  domain: string;
  reason: string;
  metrics: string[];
}

const DOMAIN_METRICS: Record<string, string[]> = {
  asymmetry: ["frontalAsymmetry", "stepSymmetry"],
  irregularRhythm: ["cadence", "strideRegularity"],
  lateralInstability: ["lateralTrunkSway", "baseOfSupport"],
  pathDeviation: ["pathDeviation"],
};

const METRIC_LABELS: Record<string, string> = {
  cadence: "Cadence",
  stepSymmetry: "Step symmetry",
  frontalAsymmetry: "Frontal asymmetry",
  strideRegularity: "Stride regularity",
  lateralTrunkSway: "Lateral trunk sway",
  pathDeviation: "Path deviation",
  baseOfSupport: "Base of support",
};

function formatDomainLabel(domain: string): string {
  return domain.charAt(0).toUpperCase() + domain.slice(1).replace(/([A-Z])/g, " $1");
}

function deriveDomainReason(domain: string, result: AnalysisSessionResult): string {
  const featureKeys = DOMAIN_METRICS[domain] ?? [];
  const limitedReason = featureKeys
    .map((key) => result.features[key as keyof AnalysisSessionResult["features"]]?.limitedReason)
    .find(Boolean);

  if (limitedReason) {
    return limitedReason;
  }

  if (result.quality.cameraAngle !== "frontal") {
    return "Camera angle was not front-on enough for this domain, so the measurement was suppressed.";
  }

  if (result.quality.frameUsability < 0.4) {
    return "Too many frames had low quality, so this domain could not be measured with enough confidence.";
  }

  if (result.quality.bodyVisibility < 0.5) {
    return "The full body was not consistently visible, which limits reliable scoring for this domain.";
  }

  if (result.trackingTelemetry && result.trackingTelemetry.cameraMotionScore > 0.4) {
    return "Camera shake was high, so this domain was suppressed to avoid overconfident interpretation.";
  }

  return "This domain was suppressed because confidence was below the clinical safety threshold for reliable reporting.";
}

export default function QualityCoachPanel({ result, onRecordAgain }: Props) {
  const suppressionReasons = useMemo<SuppressionReason[]>(
    () =>
      result.concerns.suppressedDomains.map((domain) => ({
        domain,
        reason: deriveDomainReason(domain, result),
        metrics: (DOMAIN_METRICS[domain] ?? [])
          .filter((metric) => result.features[metric as keyof AnalysisSessionResult["features"]]?.suppressed)
          .map((metric) => METRIC_LABELS[metric] ?? metric),
      })),
    [result],
  );

  const checklistItems = useMemo(() => {
    const base = result.quality.retakeSuggestions.length > 0
      ? result.quality.retakeSuggestions
      : [
          "Keep your child fully visible from head to feet in the frame.",
          "Place the phone at waist height on a stable surface.",
          "Record 4 to 6 clear walking steps toward or away from the camera.",
          "Use brighter lighting and avoid heavy shadows.",
        ];

    if (result.quality.cameraAngle !== "frontal") {
      base.unshift("Stand directly in front of the walking path for a true front-view recording.");
    }

    if (result.trackingTelemetry && result.trackingTelemetry.cameraMotionScore > 0.35) {
      base.unshift("Keep the phone still and avoid moving while your child walks.");
    }

    return Array.from(new Set(base)).slice(0, 5);
  }, [result]);

  const [reviewedChecklist, setReviewedChecklist] = useState<string[]>([]);

  const reviewedCount = checklistItems.filter((item) => reviewedChecklist.includes(item)).length;

  return (
    <Card className="bg-surface-container-lowest">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Suppression Reasons and Recapture Coach</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
            <p className="text-xs font-semibold text-amber-900">What needs recapture</p>
            <div className="mt-2 space-y-2">
              {suppressionReasons.length > 0 ? (
                suppressionReasons.map((entry) => (
                  <div key={entry.domain} className="rounded-lg bg-card/75 p-2.5">
                    <p className="text-xs font-semibold text-amber-900">{formatDomainLabel(entry.domain)}</p>
                    <p className="mt-1 text-xs text-amber-900/80">{entry.reason}</p>
                    {entry.metrics.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {entry.metrics.map((metric) => (
                          <Badge key={`${entry.domain}_${metric}`} variant="outline" className="text-[10px]">
                            {metric}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-amber-900/80">
                  No suppression was applied in this run. You can still retake for a stronger confidence profile.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-green-200 bg-green-50/70 p-3">
            <p className="text-xs font-semibold text-green-900">What was assessed with confidence</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.concerns.assessedDomains.length > 0 ? (
                result.concerns.assessedDomains.map((domain) => (
                  <Badge key={domain} className="bg-green-100 text-green-900 hover:bg-green-100">
                    {formatDomainLabel(domain)}
                  </Badge>
                ))
              ) : (
                <p className="text-xs text-green-900/80">No domains were confidently assessed in this run.</p>
              )}
            </div>
            <p className="mt-3 text-xs text-green-900/80">
              Keep these observations, and improve the suppressed domains with one cleaner capture.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/25 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold">One-tap recapture checklist</p>
            <span className="text-[11px] text-muted-foreground">
              {reviewedCount}/{checklistItems.length} reviewed
            </span>
          </div>
          <div className="mt-2 space-y-1.5">
            {checklistItems.map((item) => {
              const reviewed = reviewedChecklist.includes(item);
              return (
                <button
                  type="button"
                  key={item}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                    reviewed
                      ? "bg-green-100/70 text-green-900"
                      : "bg-card/70 text-foreground hover:bg-secondary/10"
                  }`}
                  onClick={() => {
                    setReviewedChecklist((prev) =>
                      prev.includes(item)
                        ? prev.filter((entry) => entry !== item)
                        : [...prev, item],
                    );
                  }}
                >
                  {reviewed ? (
                    <CircleCheckBig className="h-3.5 w-3.5 flex-shrink-0" />
                  ) : (
                    <CircleAlert className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  )}
                  <span>{item}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-1.5 text-xs"
              onClick={() => {
                setReviewedChecklist(checklistItems);
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark all reviewed
            </Button>
            <Button type="button" size="sm" className="gap-1.5 text-xs" onClick={onRecordAgain}>
              <Camera className="h-3.5 w-3.5" />
              Record again
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
