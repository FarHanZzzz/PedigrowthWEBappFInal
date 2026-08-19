"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { JourneyStepper } from "@/components/layout/JourneyStepper";
import { Button } from "@/components/ui/button";
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
      // Recover from stale or malformed session payloads instead of crashing the page.
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
          // Fallback to IndexedDB if network fails so the demo continues
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

  const friendlyStage =
    currentStage >= STAGE_LABELS.length
      ? "Summary ready"
      : STAGE_LABELS[Math.max(0, Math.min(currentStage, STAGE_LABELS.length - 1))];

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
    <div className="mx-auto w-full max-w-md space-y-8 py-6">
      <JourneyStepper current={3} />

      <div className="text-center">
        <h1 className="medical-title text-2xl font-semibold">Looking at the walk</h1>
        <p className="mt-2 text-sm text-muted-foreground">Usually under a minute. Keep this screen open.</p>
      </div>

      <div className="medical-surface p-6">
        <div className="flex items-end justify-between gap-3">
          <p className="text-base font-semibold">{friendlyStage}</p>
          <p className="text-sm font-medium text-primary">{Math.round(progress)}%</p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.max(progress, 6)}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Finding body position and measuring step timing from this clip.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button variant="ghost" onClick={() => router.push("/capture")}>
          Cancel
        </Button>
        <p className="max-w-xs text-center text-xs leading-relaxed text-muted-foreground">
          Analysis runs on this device. The clip is saved so you can reopen results on phone or desktop.
        </p>
      </div>
    </div>
  );
}

