"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { JourneyStepper } from "@/components/layout/JourneyStepper";
import { Button } from "@/components/ui/button";
import AnalysisProgressVisual from "@/components/analyzing/AnalysisProgressVisual";
import { runAnalysisPipeline } from "@/lib/session/analysisSession";
import { getVideo, saveResult, storeVideo } from "@/lib/session/videoStore";
import {
  readSessionRaw,
  writeResult,
  writeSession,
} from "@/lib/session/sessionStorage";
import { saveResultToCloud, uploadVideoToCloud } from "@/lib/db/cloudStorage";
import type { PipelineProgress } from "@/lib/session/analysisSession";

const STAGE_LABELS = [
  "Reading the video",
  "Getting ready",
  "Checking the clip",
  "Finding body position",
  "Measuring the walk",
  "Writing the summary",
  "Finishing up",
];

const STAGE_HINTS = [
  "Loading your clip from this device.",
  "Starting on-device pose detection.",
  "Checking lighting, framing, and clip length.",
  "Marking shoulders, hips, knees, and ankles.",
  "Turning movement into walking signals.",
  "Building the family summary and clinician packet.",
  "Saving results so you can reopen them later.",
];

export default function AnalyzingPage() {
  const router = useRouter();
  const [currentStage, setCurrentStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [stageProgress, setStageProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analysisAttempt, setAnalysisAttempt] = useState(0);
  const pipelineRan = useRef(false);

  useEffect(() => {
    if (pipelineRan.current) return;
    pipelineRan.current = true;

    const raw = readSessionRaw();
    if (!raw) {
      router.replace("/start");
      return;
    }

    let session: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        session = parsed as Record<string, unknown>;
      }
    } catch {
      session = null;
    }

    if (!session) {
      router.replace("/capture");
      return;
    }

    writeSession(session);

    const sessionId = typeof session.sessionId === "string" ? session.sessionId : null;
    const nickname =
      typeof session.nickname === "string" && session.nickname.trim().length > 0
        ? session.nickname
        : "your child";
    const ageMonths =
      typeof session.ageMonths === "number" && Number.isFinite(session.ageMonths)
        ? session.ageMonths
        : 36;
    const validationMode =
      typeof session.validationMode === "boolean"
        ? session.validationMode
        : process.env.NEXT_PUBLIC_VALIDATION_MODE === "true";
    const sourceType =
      session.sourceType === "upload" ||
      session.sourceType === "manifest_hero" ||
      session.sourceType === "demo_fixture" ||
      session.sourceType === "unknown"
        ? session.sourceType
        : "unknown";
    const sourceClipId = typeof session.sourceClipId === "string" ? session.sourceClipId : null;
    const sourceClipFilename =
      typeof session.sourceClipFilename === "string"
        ? session.sourceClipFilename
        : (
            typeof session.videoMeta === "object" &&
            session.videoMeta !== null &&
            "name" in session.videoMeta &&
            typeof (session.videoMeta as { name?: unknown }).name === "string"
          )
            ? ((session.videoMeta as { name: string }).name)
            : null;
    const approvedForDemo = typeof session.approvedForDemo === "boolean" ? session.approvedForDemo : null;
    const intakeContext =
      typeof session.clinicianContext === "object" &&
      session.clinicianContext !== null &&
      !Array.isArray(session.clinicianContext)
        ? session.clinicianContext
        : undefined;

    if (!sessionId) {
      router.replace("/capture");
      return;
    }

    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    runAnalysisPipeline(
      sessionId,
      nickname,
      ageMonths,
      (p: PipelineProgress) => {
        setCurrentStage(p.stageIndex);
        setStageProgress(Math.round(p.stageProgress * 100));
        const overallProgress = ((p.stageIndex + p.stageProgress) / p.totalStages) * 100;
        setProgress(Math.min(overallProgress, 99));
      },
      {
        validationMode,
        sourceType,
        sourceClipId,
        sourceClipFilename,
        approvedForDemo,
        intakeContext,
      },
    )
      .then(async (result) => {
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        const resultId = result.id;
        let payload = result;

        try {
          const videoData = await getVideo(sessionId);
          if (videoData?.blob) {
            await storeVideo(
              resultId,
              new File([videoData.blob], videoData.name || "clip.mp4", {
                type: videoData.type || "video/mp4",
              }),
            ).catch(() => {});
            const cloudUrl = await uploadVideoToCloud(
              resultId,
              videoData.blob,
              videoData.name,
            );
            if (cloudUrl) {
              payload = { ...result, videoUrl: cloudUrl };
            }
          }
        } catch (e) {
          console.error("Failed to upload analysis clip to cloud:", e);
        }

        try {
          await saveResultToCloud(resultId, payload);
        } catch (e) {
          console.error("Failed to save to Supabase cloud:", e);
        }

        saveResult(resultId, payload).catch(() => {});
        writeResult(resultId, payload);

        setCurrentStage(STAGE_LABELS.length);
        setProgress(100);

        setTimeout(() => {
          router.push(`/results/${resultId}`);
        }, 500);
      })
      .catch((err) => {
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        console.error("Pipeline error:", err);
        setError(
          "Something went wrong during analysis. This may be a browser compatibility issue. " +
          "You can try again or use a different browser."
        );
      });

    timeoutId = setTimeout(() => {
      if (settled) return;
      setError((existing) =>
        existing ??
        "Analysis is taking longer than expected. This may be due to video length or device performance. " +
          "Please try with a shorter video or on a different device."
      );
    }, 300_000);

    return () => {
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [router, analysisAttempt]);

  const stageIndex = Math.max(0, Math.min(currentStage, STAGE_LABELS.length - 1));
  const friendlyStage =
    currentStage >= STAGE_LABELS.length
      ? "Summary ready"
      : STAGE_LABELS[stageIndex];
  const stageHint =
    currentStage >= STAGE_HINTS.length
      ? "Opening your walking summary."
      : STAGE_HINTS[stageIndex];

  if (error) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">We couldn’t finish this clip</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{error}</p>
        <div className="mt-6 flex w-full flex-col gap-2">
          <Button
            onClick={() => {
              setError(null);
              pipelineRan.current = false;
              setCurrentStage(0);
              setProgress(0);
              setStageProgress(0);
              setAnalysisAttempt((v) => v + 1);
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
          <Button variant="outline" onClick={() => router.push("/capture")}>
            Record a new video
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 py-4">
      <JourneyStepper current={3} />

      <div className="text-center">
        <h1 className="medical-title text-2xl font-semibold">Looking at the walk</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Analysis runs on this device. Keep this screen open — usually under a minute.
        </p>
      </div>

      <div className="medical-surface overflow-hidden p-5 sm:p-6">
        <AnalysisProgressVisual
          currentStage={stageIndex}
          stageProgress={stageProgress}
          overallProgress={progress}
          stageLabel={friendlyStage}
        />

        <div className="mt-6 space-y-3 border-t border-border/60 pt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{friendlyStage}</p>
            <p className="text-sm font-semibold text-primary">{Math.round(progress)}%</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-[width] duration-500"
              style={{ width: `${Math.max(progress, 4)}%` }}
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{stageHint}</p>
        </div>
      </div>

      <div className="medical-surface p-4">
        <ol className="space-y-2">
          {STAGE_LABELS.map((label, index) => {
            const isDone = index < currentStage;
            const isActive = index === currentStage && currentStage < STAGE_LABELS.length;
            return (
              <li
                key={label}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : isDone
                      ? "text-muted-foreground"
                      : "text-muted-foreground/70"
                }`}
              >
                <span
                  className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    isDone
                      ? "bg-primary/15 text-primary"
                      : isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isDone ? "✓" : index + 1}
                </span>
                <span className={isActive ? "font-medium" : undefined}>{label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button variant="ghost" onClick={() => router.push("/capture")}>
          Cancel
        </Button>
        <p className="max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
          The clip stays on this device while we analyze it. Results reopen on phone or desktop after sign-in.
        </p>
      </div>
    </div>
  );
}
