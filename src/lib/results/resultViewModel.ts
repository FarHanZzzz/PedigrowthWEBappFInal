import { useEffect, useMemo, useState } from "react";
import type { AnalysisSessionResult } from "@/lib/session/analysisSession";
import { buildRunProvenance } from "@/lib/session/runProvenance";
import { getResult } from "@/lib/session/videoStore";
import {
  readResultRaw,
  readSession,
  writeResult,
} from "@/lib/session/sessionStorage";
import { fetchResultFromCloud } from "@/lib/db/cloudStorage";
import { buildKeyFrames } from "@/lib/trace/buildKeyFrames";
import { summarizeDetectionPath, type ConcernEvidence } from "@/lib/trace/summarizeDetectionPath";

function formatDemoVideoPath(sourceClipFilename: string | null): string | null {
  if (!sourceClipFilename) return null;
  if (
    sourceClipFilename.startsWith("/") ||
    sourceClipFilename.startsWith("http://") ||
    sourceClipFilename.startsWith("https://")
  ) {
    return sourceClipFilename;
  }
  return `/demo/videos/${sourceClipFilename}`;
}

export function formatDomainLabel(domain: string): string {
  return domain.charAt(0).toUpperCase() + domain.slice(1).replace(/([A-Z])/g, " $1");
}

export function normalizeResult(raw: string): AnalysisSessionResult {
  const parsed = JSON.parse(raw) as AnalysisSessionResult & {
    isDemo?: boolean;
    demoScenario?: string;
    run?: AnalysisSessionResult["run"];
  };

  if (!parsed.run) {
    parsed.run = buildRunProvenance({
      classification: parsed.isDemo ? "demo_fixture" : "real_analysis",
      sourceType: parsed.isDemo ? "demo_fixture" : "unknown",
      sourceClipFilename: parsed.trace?.run.sourceClipFilename ?? null,
      modelId: parsed.trace?.run.modelId ?? "unknown",
      modelLabel: parsed.trace?.run.modelLabel ?? "Unknown model",
    });
  }

  return parsed;
}

export interface ResultViewModel {
  result: AnalysisSessionResult | null;
  videoUrl: string | null;
  exportAvailable: boolean;
  keyFrames: ReturnType<typeof buildKeyFrames> | null;
  concernEvidence: ConcernEvidence[];
  hasTrace: boolean;
  hasVideo: boolean;
  direction: string;
  isBestEffort: boolean;
  isValidationFailure: boolean;
  isCannotAssessRealRun: boolean;
  isLoading: boolean;
}

export function useResultViewModel(resultId: string): ResultViewModel {
  const [result, setResult] = useState<AnalysisSessionResult | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [exportAvailable, setExportAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let timeoutId: NodeJS.Timeout;
    let attempts = 0;
    const maxAttempts = 15;

    const loadData = async () => {
      try {
        const cloudData = await fetchResultFromCloud(resultId);
        if (cloudData) {
          if (!active) return;
          setResult(normalizeResult(JSON.stringify(cloudData)));
          setIsLoading(false);
          try {
            const { saveResult } = await import("@/lib/session/videoStore");
            await saveResult(resultId, cloudData);
          } catch {}
          return;
        }

        const raw = readResultRaw(resultId);
        if (raw) {
          if (!active) return;
          setResult(normalizeResult(raw));
          setIsLoading(false);
          return;
        }

        const stored = await getResult(resultId);
        if (stored) {
          if (!active) return;
          writeResult(resultId, stored);
          setResult(normalizeResult(JSON.stringify(stored)));
          setIsLoading(false);
          return;
        }

        if (attempts < maxAttempts) {
          attempts++;
          timeoutId = setTimeout(loadData, 1500);
        } else {
          if (active) {
            setResult(null);
            setIsLoading(false);
          }
        }
      } catch (err) {
        console.error("Cloud fetch failed:", err);
        if (!active) return;
        
        const raw = readResultRaw(resultId);
        if (raw) {
          setResult(normalizeResult(raw));
        } else {
          setResult(null);
        }
        setIsLoading(false);
      }
    };

    loadData();

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [resultId]);

  useEffect(() => {
    const currentResult = result;

    if (!currentResult) {
      setVideoUrl(null);
      return;
    }

    const resolvedResult: AnalysisSessionResult = currentResult;

    let objectUrl: string | null = null;
    let active = true;

    async function loadVideo() {
      if (resolvedResult.run.classification !== "real_analysis") {
        if (resolvedResult.videoUrl) {
          setVideoUrl(resolvedResult.videoUrl);
          return;
        }
        setVideoUrl(formatDemoVideoPath(resolvedResult.run.sourceClipFilename));
        return;
      }

      const sessionId =
        resolvedResult.trace?.sessionId ??
        (() => {
          const session = readSession<{ sessionId?: string }>();
          return session?.sessionId ?? null;
        })();

      if (!sessionId) {
        setVideoUrl(resolvedResult.videoUrl ?? null);
        return;
      }

      try {
        const { getVideo } = await import("@/lib/session/videoStore");
        const videoData = await getVideo(sessionId);
        if (!videoData?.blob) {
          if (active) setVideoUrl(resolvedResult.videoUrl ?? null);
          return;
        }

        objectUrl = URL.createObjectURL(videoData.blob);
        if (active) setVideoUrl(objectUrl);
      } catch {
        if (active) setVideoUrl(resolvedResult.videoUrl ?? null);
      }
    }

    void loadVideo();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [result]);

  useEffect(() => {
    if (!result?.run.exportArtifactPath) {
      setExportAvailable(false);
      return;
    }

    let active = true;
    fetch(result.run.exportArtifactPath, { method: "HEAD" })
      .then((response) => {
        if (active) setExportAvailable(response.ok);
      })
      .catch(() => {
        if (active) setExportAvailable(false);
      });

    return () => {
      active = false;
    };
  }, [result?.run.exportArtifactPath]);

  const keyFrames = useMemo(
    () => (result?.trace ? buildKeyFrames(result.trace) : null),
    [result?.trace]
  );

  const concernEvidence = useMemo(
    () =>
      result?.trace
        ? summarizeDetectionPath(result.trace, {
            asymmetry: result.concerns.asymmetry,
            irregularRhythm: result.concerns.irregularRhythm,
            lateralInstability: result.concerns.lateralInstability,
            pathDeviation: result.concerns.pathDeviation,
          })
        : [],
    [result?.trace, result?.concerns]
  );

  const hasTrace = Boolean(result?.trace);
  const hasVideo = Boolean(videoUrl);
  const direction = result?.trace?.pipeline.direction ?? "unknown";
  const isBestEffort = result?.assessmentMode === "best_effort";
  const isValidationFailure = result?.run.classification === "validation_failure";
  const isCannotAssessRealRun =
    result?.run.classification === "real_analysis" && result.assessmentMode === "cannot_assess";

  return {
    result,
    videoUrl,
    exportAvailable,
    keyFrames,
    concernEvidence,
    hasTrace,
    hasVideo,
    direction,
    isBestEffort,
    isValidationFailure,
    isCannotAssessRealRun,
    isLoading,
  };
}