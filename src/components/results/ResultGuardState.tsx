"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Camera } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import RunProvenanceBadge from "@/components/results/RunProvenanceBadge";
import type { AnalysisSessionResult } from "@/lib/session/analysisSession";

interface Props {
  result: AnalysisSessionResult;
}

export default function ResultGuardState({ result }: Props) {
  const router = useRouter();
  const run = result.run;

  if (run.classification === "validation_failure") {
    return (
      <div className="min-h-dvh bg-gradient-to-b from-background to-muted/30 px-4 py-8">
        <div className="mx-auto max-w-lg space-y-5">
          <div className="flex justify-center">
            <RunProvenanceBadge run={run} />
          </div>

          <Card className="border-red-200 bg-red-50/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-red-900">
                Validation failed before analysis could complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-red-900/85">
              <p>{run.failureReason ?? "The pipeline stopped before producing a trustworthy result."}</p>
              <div className="rounded-lg bg-card/70 p-3 text-xs">
                <p><strong>Stage:</strong> {run.failureStage ?? "unknown"}</p>
                <p><strong>Source:</strong> {run.sourceClipFilename ?? "unknown clip"}</p>
                <p><strong>Model:</strong> {run.modelLabel}</p>
                <p><strong>Validation mode:</strong> {run.validationMode ? "on" : "off"}</p>
              </div>
              <p className="text-xs text-red-800/80">
                No fallback result was substituted. This is intentional so demo output never misrepresents a failed analysis.
              </p>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button onClick={() => router.push("/capture")} className="flex-1 gap-2">
              <Camera className="h-4 w-4" />
              Try Another Clip
            </Button>
            <Button onClick={() => router.push("/start")} variant="outline" className="flex-1">
              Start Over
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isCannotAssessRealRun =
    run.classification === "real_analysis" && result.assessmentMode === "cannot_assess";

  if (isCannotAssessRealRun) {
    return (
      <div className="min-h-dvh bg-gradient-to-b from-background to-muted/30 px-4 py-8">
        <div className="mx-auto max-w-lg space-y-6">
          <div className="flex justify-center">
            <RunProvenanceBadge run={run} />
          </div>

          <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              <div>
                <p className="text-sm font-semibold text-red-800">
                  This clip could not be assessed safely
                </p>
                <p className="mt-1 text-xs text-red-700">{result.quality.confidenceNotes}</p>
                {result.quality.failureReasons.map((reason, index) => (
                  <p key={index} className="mt-1 text-xs text-red-600">• {reason}</p>
                ))}
              </div>
            </div>
          </div>

          {result.quality.retakeInstructions && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">How to get a better recording</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-line text-xs text-muted-foreground">
                {result.quality.retakeInstructions}
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button onClick={() => router.push("/capture")} className="flex-1 gap-2">
              <Camera className="h-4 w-4" />
              Record Again
            </Button>
            <Button onClick={() => router.push("/start")} variant="outline" className="flex-1">
              Start Over
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}