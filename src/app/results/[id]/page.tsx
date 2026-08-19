"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Camera,
  Download,
  MessageCircle,
  MessageSquare,
  PlayCircle,
  Stethoscope,
  Video,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AnnotatedVideoPlayer from "@/components/results/AnnotatedVideoPlayer";
import PatientSimpleCards from "@/components/results/PatientSimpleCards";
import { getResult } from "@/lib/session/videoStore";
import {
  readResultRaw,
  readSession,
  writeResult,
} from "@/lib/session/sessionStorage";
import { fetchResultFromCloud } from "@/lib/db/cloudStorage";
import RunProvenanceBadge from "@/components/results/RunProvenanceBadge";
import { exportReportAsPDF } from "@/lib/export/generatePDF";
import { buildRunProvenance } from "@/lib/session/runProvenance";
import type { AnalysisSessionResult } from "@/lib/session/analysisSession";
import type { AnalysisTrace } from "@/lib/trace/traceTypes";
import { buildReportBundle } from "@/lib/reports";
import {
  CONCERN_BADGE_STYLES,
  CONCERN_LABELS,
  CONCERN_PREFIX,
  FOLLOWUP_BADGE_STYLES,
  FOLLOWUP_CALLOUT_STYLES,
  FOLLOWUP_CALLOUT_TEXT,
  FOLLOWUP_LABELS,
  toConcernLevel,
  toFollowupPriority,
} from "@/lib/presentation/severity";

type ResultTab = "summary" | "video";

const TABS: { key: ResultTab; label: string; icon: typeof BarChart3 }[] = [
  { key: "summary", label: "Summary", icon: BarChart3 },
  { key: "video", label: "Hero Video", icon: PlayCircle },
];

const CONCERN_DOMAINS = [
  { key: "asymmetry", label: "Asymmetry", desc: "Left-right differences in walking pattern" },
  { key: "irregularRhythm", label: "Rhythm regularity", desc: "Consistency of step timing and cadence" },
  { key: "lateralInstability", label: "Lateral stability", desc: "Side-to-side steadiness during walking" },
  { key: "pathDeviation", label: "Path deviation", desc: "Walking in a straight line vs. veering" },
];

const DOMAIN_DAILY_IMPACT: Record<string, string> = {
  asymmetry: "We noticed differences between the left and right sides. This means one side of the body might be working harder or moving differently than the other, which can become more noticeable or tiring during longer walks.",
  irregularRhythm: "Your child's step timing shows some variation. Instead of a steady, predictable rhythm, their steps might occasionally speed up or slow down, making walking look less smooth and requiring more effort on their part.",
  lateralInstability: "There seems to be some side-to-side wobbling. This means their balance is a bit less steady, making it harder for them to maintain a strong center of gravity, especially when turning around corners or trying to walk quickly.",
  pathDeviation: "We saw that your child tends to drift away from walking in a straight line. They might need a bit more visual focus or a guiding hand to stay on a clear path, rather than walking straight ahead.",
};

const DOMAIN_MONITORING_FOCUS: Record<string, string> = {
  asymmetry: "Watch whether one side tires sooner or is used less during play.",
  irregularRhythm: "Watch for step timing changes across the day or with fatigue.",
  lateralInstability: "Track near-falls, stumbles, or hesitation during direction changes.",
  pathDeviation: "Track whether straight-path walking improves with cueing and a clear walkway.",
};

type HotspotSeverity = "low" | "medium" | "high";

interface AssistantIssueHotspot {
  id: string;
  title: string;
  description: string;
  domain: string;
  severity: HotspotSeverity;
  frameIndex: number;
  timestampMs: number;
}

interface SessionMotorAssessment {
  delayFlag?: "on_track" | "watch" | "concern";
  summaryNote?: string;
  achievedFromPriorCount?: number;
  expectedFromPriorCount?: number;
  delayedMilestonesCount?: number;
  aimsNotObservedCount?: number;
}

interface SessionClinicalAssessment {
  redFlags?: string[];
  urgentRedFlagCount?: number;
  motorDelayAssessment?: SessionMotorAssessment | null;
  aimsCompleted?: boolean;
  assessedAt?: string;
  supplementalMetadata?: {
    source?: "supplemental";
    linkedResultId?: string;
    completedAt?: string;
  };
}

interface ResultWithClinicalAssessment {
  clinicalAssessment?: SessionClinicalAssessment;
  session?: {
    clinicalAssessment?: SessionClinicalAssessment;
  };
}

function toHotspotSeverity(level: string): HotspotSeverity {
  const normalized = level.toLowerCase();
  if (normalized === "significant" || normalized === "high") return "high";
  if (normalized === "moderate") return "medium";
  return "low";
}

function hasConcernSignal(level: string): boolean {
  const normalized = level.toLowerCase();
  return normalized !== "none";
}

function pickMaxBy<T>(items: T[], valueOf: (item: T) => number): T | null {
  if (items.length === 0) return null;
  let winner = items[0];
  let winnerScore = valueOf(winner);
  for (let i = 1; i < items.length; i += 1) {
    const score = valueOf(items[i]);
    if (score > winnerScore) {
      winner = items[i];
      winnerScore = score;
    }
  }
  return winner;
}

function pickPathDeviationFrame(trace: AnalysisTrace): { frameIndex: number; timestampMs: number } | null {
  const points = trace.frames
    .filter((frame) => frame.hipMidpoint)
    .map((frame) => ({
      frameIndex: frame.frameIndex,
      timestampMs: frame.timestampMs,
      t: frame.timestampMs,
      x: frame.hipMidpoint!.x,
    }));

  if (points.length < 6) return null;

  const meanT = points.reduce((sum, p) => sum + p.t, 0) / points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / points.length;

  const numerator = points.reduce((sum, p) => sum + (p.t - meanT) * (p.x - meanX), 0);
  const denominator = points.reduce((sum, p) => sum + (p.t - meanT) ** 2, 0);
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanX - slope * meanT;

  const winner = pickMaxBy(points, (p) => Math.abs(p.x - (slope * p.t + intercept)));
  if (!winner) return null;

  return { frameIndex: winner.frameIndex, timestampMs: winner.timestampMs };
}

function buildAssistantIssueHotspots(result: AnalysisSessionResult): AssistantIssueHotspot[] {
  const trace = result.trace;
  if (!trace || trace.frames.length === 0) return [];

  const hotspots: AssistantIssueHotspot[] = [];
  const suppressed = new Set(result.concerns.suppressedDomains);

  if (!suppressed.has("asymmetry") && hasConcernSignal(result.concerns.asymmetry)) {
    const asymmetryFrame = pickMaxBy(
      trace.frames.filter((f) => f.leftAnkle && f.rightAnkle),
      (f) => Math.abs((f.leftAnkle?.y ?? 0) - (f.rightAnkle?.y ?? 0))
    );
    if (asymmetryFrame) {
      hotspots.push({
        id: "asymmetry_peak",
        title: "Left-right asymmetry peak",
        description: "Largest left-right ankle difference in this clip.",
        domain: "asymmetry",
        severity: toHotspotSeverity(result.concerns.asymmetry),
        frameIndex: asymmetryFrame.frameIndex,
        timestampMs: asymmetryFrame.timestampMs,
      });
    }
  }

  if (!suppressed.has("irregularRhythm") && hasConcernSignal(result.concerns.irregularRhythm)) {
    const durations = trace.gaitCycles.map((cycle) => cycle.durationMs);
    if (durations.length > 0) {
      const sorted = [...durations].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const cycle = pickMaxBy(trace.gaitCycles, (entry) => Math.abs(entry.durationMs - median));
      if (cycle) {
        hotspots.push({
          id: "rhythm_outlier",
          title: "Rhythm irregularity moment",
          description: "Step timing differs most from the clip's typical rhythm here.",
          domain: "irregularRhythm",
          severity: toHotspotSeverity(result.concerns.irregularRhythm),
          frameIndex: Math.max(0, Math.round((cycle.startFrame + cycle.endFrame) / 2)),
          timestampMs: Math.max(0, Math.round((cycle.startTimeMs + cycle.endTimeMs) / 2)),
        });
      }
    }
  }

  if (!suppressed.has("lateralInstability") && hasConcernSignal(result.concerns.lateralInstability)) {
    const lateralFrame = pickMaxBy(
      trace.frames.filter((f) => typeof f.lateralOffset === "number"),
      (f) => Math.abs(f.lateralOffset ?? 0)
    );
    if (lateralFrame) {
      hotspots.push({
        id: "lateral_instability_peak",
        title: "Lateral instability peak",
        description: "Greatest side-to-side trunk offset in this clip.",
        domain: "lateralInstability",
        severity: toHotspotSeverity(result.concerns.lateralInstability),
        frameIndex: lateralFrame.frameIndex,
        timestampMs: lateralFrame.timestampMs,
      });
    }
  }

  if (!suppressed.has("pathDeviation") && hasConcernSignal(result.concerns.pathDeviation)) {
    const pathFrame = pickPathDeviationFrame(trace);
    if (pathFrame) {
      hotspots.push({
        id: "path_deviation_peak",
        title: "Path deviation peak",
        description: "Greatest deviation from a straight walking path.",
        domain: "pathDeviation",
        severity: toHotspotSeverity(result.concerns.pathDeviation),
        frameIndex: pathFrame.frameIndex,
        timestampMs: pathFrame.timestampMs,
      });
    }
  }

  if (result.quality.result !== "pass") {
    const lowVisibilityFrame = pickMaxBy(trace.frames, (f) => 1 - f.bodyVisibility);
    if (lowVisibilityFrame) {
      hotspots.push({
        id: "low_visibility",
        title: "Low-visibility segment",
        description: "Tracking confidence drops here, so interpretation is less certain.",
        domain: "quality",
        severity: result.quality.result === "borderline" ? "medium" : "high",
        frameIndex: lowVisibilityFrame.frameIndex,
        timestampMs: lowVisibilityFrame.timestampMs,
      });
    }
  }

  const severityRank: Record<HotspotSeverity, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  const unique = new Map<string, AssistantIssueHotspot>();
  for (const spot of hotspots) {
    unique.set(`${spot.domain}_${spot.frameIndex}`, spot);
  }

  return Array.from(unique.values())
    .sort((a, b) => {
      const severityDelta = severityRank[b.severity] - severityRank[a.severity];
      if (severityDelta !== 0) return severityDelta;
      return a.timestampMs - b.timestampMs;
    })
    .slice(0, 6);
}

function normalizeResult(raw: string): AnalysisSessionResult {
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

function resolveFallbackVideoUrl(result: AnalysisSessionResult): string | null {
  if (typeof result.videoUrl === "string" && result.videoUrl.trim().length > 0) {
    return result.videoUrl;
  }

  if (result.run.classification !== "real_analysis") {
    return formatDemoVideoPath(result.run.sourceClipFilename ?? null);
  }

  if (typeof result.run.exportArtifactPath === "string" && result.run.exportArtifactPath.trim().length > 0) {
    return result.run.exportArtifactPath;
  }

  return null;
}

function formatDomainLabel(domain: string): string {
  return domain.charAt(0).toUpperCase() + domain.slice(1).replace(/([A-Z])/g, " $1");
}

const AssistantPanel = dynamic(() => import("@/components/results/AssistantPanel"), {
  ssr: false,
  loading: () => <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Loading assistant...</div>,
});

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const resultId = params.id as string;

  const [result, setResult] = useState<AnalysisSessionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ResultTab>("summary");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [exportAvailable, setExportAvailable] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [jumpToFrameIndex, setJumpToFrameIndex] = useState<number | null>(null);
  const [sessionClinicalAssessment, setSessionClinicalAssessment] =
    useState<SessionClinicalAssessment | null>(null);

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
          import("@/lib/session/videoStore").then(({ saveResult }) => {
            saveResult(resultId, cloudData).catch(() => {});
          });
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
          setResult(normalizeResult(JSON.stringify(stored)));
          writeResult(resultId, stored);
          setIsLoading(false);
          return;
        }

        if (attempts < maxAttempts) {
          attempts++;
          timeoutId = setTimeout(loadData, 1500);
        } else {
          if (active) setIsLoading(false);
        }
      } catch (e) {
        console.error("Failed to fetch from cloud:", e);
        if (!active) return;
        const raw = readResultRaw(resultId);
        if (raw) setResult(normalizeResult(raw));
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
    if (result) {
      const embedded = result as unknown as ResultWithClinicalAssessment;
      const linkedClinicalAssessment =
        embedded.clinicalAssessment ?? embedded.session?.clinicalAssessment ?? null;
      if (linkedClinicalAssessment) {
        setSessionClinicalAssessment(linkedClinicalAssessment);
        return;
      }
    }

    const session = readSession<{ clinicalAssessment?: SessionClinicalAssessment }>();
    if (session?.clinicalAssessment) {
      setSessionClinicalAssessment(session.clinicalAssessment);
    }
  }, [result, resultId]);

  useEffect(() => {
    if (!result) {
      setVideoUrl(null);
      return;
    }

    if (result.run.classification !== "real_analysis") {
      setVideoUrl(resolveFallbackVideoUrl(result));
      return;
    }

    const sessionId =
      result.trace?.sessionId ??
      (() => {
        const session = readSession<{ sessionId?: string }>();
        return session?.sessionId ?? null;
      })();

    if (!sessionId) {
      setVideoUrl(resolveFallbackVideoUrl(result));
      return;
    }

    let objectUrl: string | null = null;
    import("@/lib/session/videoStore")
      .then(({ getVideo }) => getVideo(sessionId))
      .then((videoData) => {
        if (!videoData?.blob) {
          setVideoUrl(resolveFallbackVideoUrl(result));
          return;
        }
        objectUrl = URL.createObjectURL(videoData.blob);
        setVideoUrl(objectUrl);
      })
      .catch(() => {
        setVideoUrl(resolveFallbackVideoUrl(result));
      });

    return () => {
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

  const reportBundle = useMemo(() => {
    if (!result) return null;

    if (result.reports?.caregiver && result.reports?.clinician && result.reports?.handoffText) {
      return result.reports;
    }

    const bundle = buildReportBundle({
      assessmentId: result.id,
      nickname: result.session.nickname,
      ageMonths: result.session.ageMonths,
      intakeContext: result.session.intakeContext,
      analyzedAt: result.analyzedAt,
      concerns: {
        asymmetry: result.concerns.asymmetry,
        irregularRhythm: result.concerns.irregularRhythm,
        lateralInstability: result.concerns.lateralInstability,
        pathDeviation: result.concerns.pathDeviation,
        overallLevel: result.concerns.overallLevel,
        followupPriority: result.concerns.followupPriority,
        contextNotes: result.concerns.contextNotes,
        suppressedDomains: result.concerns.suppressedDomains,
        assessedDomains: result.concerns.assessedDomains,
        qualityWarning: result.concerns.qualityWarning,
        viewLabel: result.concerns.viewLabel,
        assessmentModeLabel: result.concerns.assessmentModeLabel,
        assessmentMode: result.concerns.assessmentMode,
      },
      quality: {
        result: result.quality.result,
        cameraAngle: result.quality.cameraAngle,
        confidenceMultiplier: result.quality.confidenceMultiplier,
        confidenceNotes: result.quality.confidenceNotes,
        failureReasons: result.quality.failureReasons,
        borderlineReasons: result.quality.borderlineReasons,
        suppressedMetrics: result.quality.suppressedMetrics,
      },
      features: result.features,
      trace: result.trace,
    });

    return {
      caregiver: bundle.caregiverReport,
      clinician: bundle.clinicianPacket,
      handoffText: bundle.handoffText,
    };
  }, [result]);

  useEffect(() => {
    if (!result || !reportBundle) return;

    if (result.reports?.caregiver && result.reports?.clinician && result.reports?.handoffText) {
      return;
    }

    const updated = {
      ...result,
      reports: reportBundle,
    };

    setResult(updated);
    writeResult(result.id, updated);
  }, [result, reportBundle]);

  const practicalRetakeTips = useMemo(() => {
    if (!result) return [];

    const tips =
      result.quality.retakeSuggestions.length > 0
        ? result.quality.retakeSuggestions
        : [
            "Keep your child fully visible from head to toe in the frame.",
            "Hold the phone steady at about waist height.",
            "Capture 4 to 6 uninterrupted walking steps.",
            "Use brighter lighting and avoid strong shadows.",
          ];

    return Array.from(new Set(tips)).slice(0, 4);
  }, [result]);

  const assistantMetrics = useMemo(() => {
    if (!result) return undefined;

    return {
      symmetry_index: result.features.stepSymmetry.value,
      cadence: result.features.cadence.value,
      frontal_asymmetry: result.features.frontalAsymmetry.value,
      stride_regularity: result.features.strideRegularity.value,
      path_deviation: result.features.pathDeviation.value,
      base_of_support: result.features.baseOfSupport.value,
    };
  }, [result]);

  const assistantRiskCategory = useMemo(() => {
    if (!result) return "unknown";

    switch (result.concerns.overallLevel) {
      case "significant":
        return "high";
      case "moderate":
        return "moderate";
      case "mild":
      case "none":
      default:
        return "low";
    }
  }, [result]);

  const assistantContext = useMemo(() => {
    if (!result) return undefined;

    const hotspots = buildAssistantIssueHotspots(result);

    return {
      summary: result.reports?.caregiver?.observationsText,
      confidence_notes: result.quality.confidenceNotes,
      followup_priority: result.concerns.followupPriority,
      assessed_domains: result.concerns.assessedDomains,
      retake_suggestions: result.quality.retakeSuggestions,
      quality_result: result.quality.result,
      issue_hotspots: hotspots.map((spot) => ({
        id: spot.id,
        title: spot.title,
        description: spot.description,
        domain: spot.domain,
        severity: spot.severity,
        frame_index: spot.frameIndex,
        timestamp_ms: spot.timestampMs,
      })),
    };
  }, [result]);

  const assistantIssueHotspots = useMemo(() => {
    if (!result) return [];
    return buildAssistantIssueHotspots(result);
  }, [result]);

  const parentImpactRows = useMemo(() => {
    if (!result) return [];

    return CONCERN_DOMAINS
      .map((domain) => {
        const isSuppressed = result.concerns.suppressedDomains.includes(domain.key);
        if (isSuppressed) return null;

        const level = toConcernLevel(String(result.concerns[domain.key as keyof typeof result.concerns]));
        if (level === "none") return null;

        return {
          key: domain.key,
          label: domain.label,
          level,
          impact: DOMAIN_DAILY_IMPACT[domain.key] ?? "This signal may affect day-to-day walking quality.",
          monitor: DOMAIN_MONITORING_FOCUS[domain.key] ?? "Monitor this pattern in everyday walking.",
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [result]);

  const supplementalMotorMetadata = useMemo(() => {
    const metadata = sessionClinicalAssessment?.supplementalMetadata;
    if (!metadata || metadata.source !== "supplemental") {
      return null;
    }

    if (metadata.linkedResultId && metadata.linkedResultId !== resultId) {
      return null;
    }

    return metadata;
  }, [resultId, sessionClinicalAssessment]);


  const handleFocusIssue = (frameIndex: number) => {
    if (!result?.trace || !videoUrl) return;
    setActiveTab("video");
    setJumpToFrameIndex(null);
    requestAnimationFrame(() => {
      setJumpToFrameIndex(frameIndex);
    });
  };

  useEffect(() => {
    if (!isAssistantOpen) {
      const toggle = document.getElementById("assistant-toggle-button") as HTMLButtonElement | null;
      toggle?.focus();
    }
  }, [isAssistantOpen]);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 bg-surface-container-low/50">
        <div className="text-center space-y-4">
          <Activity className="h-10 w-10 text-muted-foreground/50 mx-auto animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">
            Loading assessment report...
          </p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            Result not found. It may have expired.
          </p>
          <Button onClick={() => router.push("/start")} variant="outline">
            Start Over
          </Button>
        </div>
      </div>
    );
  }

  const run = result.run;
  const isBestEffort = result.assessmentMode === "best_effort";
  const isValidationFailure = run.classification === "validation_failure";
  const isCannotAssessRealRun =
    run.classification === "real_analysis" && result.assessmentMode === "cannot_assess";
  const hasTrace = Boolean(result.trace);
  const hasVideo = Boolean(videoUrl);
  const canJumpToVideo = hasTrace && hasVideo;
  const nickname = result.session.nickname;
  const followupPriority = toFollowupPriority(result.concerns.followupPriority);
  const followupLabel = FOLLOWUP_LABELS[followupPriority];
  const followupSummary = FOLLOWUP_CALLOUT_TEXT[followupPriority];

  const simpleCardObservations =
    parentImpactRows.length > 0
      ? parentImpactRows.slice(0, 3).map((entry) => `${entry.label}: ${entry.impact}`)
      : [
          "No major concern signal was detected in this clip.",
          "Keep routine observation and note if walking pattern changes.",
        ];

  const simpleCardActions = [
    "Keep this summary ready for your next appointment.",
    "Track if balance, falls, or asymmetry changes this week.",
    ...practicalRetakeTips.slice(0, 2).map((tip) => `If possible, record a new clip: ${tip}`),
  ].slice(0, 4);

  const simpleCardQuestions =
    reportBundle?.caregiver?.clinicianQuestions?.slice(0, 5) ?? [
      "What should we monitor daily at home?",
      "Do these movement patterns suggest earlier review?",
      "When should we repeat this assessment?",
    ];
  const motorSummaryTimestamp =
    supplementalMotorMetadata?.completedAt ?? sessionClinicalAssessment?.assessedAt ?? null;
  const hasMotorScreenAttached = Boolean(sessionClinicalAssessment?.motorDelayAssessment);

  if (isValidationFailure) {
    return (
      <div className="px-4 py-8">
        <div className="mx-auto max-w-lg space-y-5">
          <div className="flex justify-center">
            <RunProvenanceBadge run={run} />
          </div>

          <Card className="bg-error-container/65">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-red-900">
                Validation failed before real analysis could complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-red-900/85">
              <p>{run.failureReason ?? "The pipeline stopped before producing a trustworthy result."}</p>
              <div className="rounded-xl bg-surface-container-lowest/80 p-3 text-xs">
                <p><strong>Stage:</strong> {run.failureStage ?? "unknown"}</p>
                <p><strong>Source:</strong> {run.sourceClipFilename ?? "unknown clip"}</p>
                <p><strong>Model:</strong> {run.modelLabel}</p>
                <p><strong>Validation mode:</strong> {run.validationMode ? "on" : "off"}</p>
              </div>
              <p className="text-xs text-red-800/80">
                No fallback result was substituted. This failure is intentional so the demo never pretends a broken run was real.
              </p>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button onClick={() => router.push("/capture")} className="flex-1 gap-2">
              <Camera className="h-4 w-4" />
              Try Another Clip
            </Button>
            <Button onClick={() => router.push("/start")} variant="secondary" className="flex-1">
              Start Over
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isCannotAssessRealRun) {
    return (
      <div className="px-4 py-8">
        <div className="mx-auto max-w-lg space-y-6">
          <div className="flex justify-center">
            <RunProvenanceBadge run={run} />
          </div>

          <div className="rounded-[1.2rem] bg-error-container p-4">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">
                  We ran a real analysis, but this clip could not be assessed safely
                </p>
                <p className="mt-1 text-xs text-red-700">
                  {result.quality.confidenceNotes}
                </p>
                {result.quality.failureReasons.map((reason, index) => (
                  <p key={index} className="mt-1 text-xs text-red-600">
                    • {reason}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {result.quality.retakeInstructions && (
            <Card className="bg-surface-container-low">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">How to get a better recording</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground whitespace-pre-line">
                {result.quality.retakeInstructions}
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button onClick={() => router.push("/capture")} className="flex-1 gap-2">
              <Camera className="h-4 w-4" />
              Record Again
            </Button>
            <Button onClick={() => router.push("/start")} variant="secondary" className="flex-1">
              Start Over
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {isBestEffort && (
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-2">
          <p className="text-xs text-amber-900 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>
              <strong>Limited-confidence analysis.</strong> The clip was usable, but confidence constraints may reduce reliability for some metrics.
            </span>
          </p>
        </div>
      )}

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div className="text-center space-y-3">
          <h1 data-display="true" className="text-3xl font-bold">Walking Summary for {nickname}</h1>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
            A simple parent-facing summary of what this clip showed, what could not be assessed, and what to do next.
          </p>

          <div className="print-hidden inline-flex items-center rounded-xl border border-border/60 bg-surface-container-low p-1">
            <button
              type="button"
              className="rounded-lg bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-foreground shadow-sm"
              aria-current="page"
            >
              Parent View
            </button>
            <button
              type="button"
              onClick={() => router.push(`/results/${resultId}/clinician`)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Clinician View
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Reviewed {new Date(result.analyzedAt).toLocaleString()}
          </p>
        </div>

        <Card className="relative overflow-hidden border border-indigo-100/50 bg-card/70 backdrop-blur-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] hover:bg-card/90 group/card">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 via-white/20 to-teal-50/30 opacity-70 pointer-events-none" />
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-400 via-indigo-400 to-blue-500 opacity-80" />
          <CardContent className="relative grid gap-8 p-8 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/60">
            <div className="group transition-transform duration-300 hover:-translate-y-1 sm:pr-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="rounded-full bg-teal-100/80 p-1.5 text-teal-700 ring-1 ring-teal-200/50">
                  <Activity className="h-3.5 w-3.5" />
                </div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-teal-800/80">OVERALL OBSERVATION</p>
              </div>
              <p className="text-[17px] font-bold leading-snug text-foreground transition-colors group-hover:text-teal-900">
                {reportBundle?.caregiver.observationsText ??
                  (result.concerns.overallLevel === "none"
                    ? "No notable gait concern signals were detected in this clip."
                    : "This clip shows movement patterns worth reviewing more closely.")}
              </p>
              {reportBundle?.caregiver.contextSignalText && (
                <p className="mt-3 text-[13px] font-medium text-muted-foreground leading-relaxed bg-card/50 p-2 rounded-lg border border-border/50">
                  {reportBundle.caregiver.contextSignalText}
                </p>
              )}
            </div>
            
            <div className="group transition-transform duration-300 hover:-translate-y-1 sm:px-6 pt-6 sm:pt-0">
              <div className="flex items-center gap-2 mb-3">
                <div className="rounded-full bg-indigo-100/80 p-1.5 text-primary ring-1 ring-indigo-200/50">
                  <BarChart3 className="h-3.5 w-3.5" />
                </div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-800/80">HOW CERTAIN THIS RUN IS</p>
              </div>
              <p className="text-[14px] font-medium text-muted-foreground leading-relaxed">
                {reportBundle?.caregiver.confidenceText ?? result.quality.confidenceNotes}
              </p>
            </div>

            <div className="group transition-transform duration-300 hover:-translate-y-1 sm:pl-6 pt-6 sm:pt-0">
              <div className="flex items-center gap-2 mb-3">
                <div className="rounded-full bg-blue-100/80 p-1.5 text-blue-700 ring-1 ring-blue-200/50">
                  <Stethoscope className="h-3.5 w-3.5" />
                </div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-blue-800/80">RECOMMENDED NEXT STEP</p>
              </div>
              <Badge variant="outline" className={`mb-3 py-1 px-2.5 text-[10px] uppercase font-bold tracking-widest shadow-sm ${FOLLOWUP_BADGE_STYLES[followupPriority]}`}>
                {followupLabel}
              </Badge>
              <p className="text-[14px] font-medium text-muted-foreground leading-relaxed">
                {followupSummary}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex rounded-[1.25rem] bg-card/40 p-1.5 backdrop-blur-xl shadow-inner ring-1 ring-black/5 mx-auto max-w-2xl">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all duration-300 cursor-pointer ${
                  activeTab === tab.key
                    ? "bg-card text-foreground shadow-md ring-1 ring-white"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                }`}
              >
                <Icon className={`h-4 w-4 ${activeTab === tab.key ? "opacity-100" : "opacity-70"}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {result.clinicianFeedback && (
          <div className="relative overflow-hidden rounded-3xl bg-primary-container/80 p-6 shadow-md ring-1 ring-indigo-200/50 backdrop-blur-sm border-l-4 border-l-indigo-500">
            <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none transform translate-x-4 -translate-y-4">
              <MessageSquare className="h-40 w-40 text-primary-foreground" />
            </div>
            <div className="relative z-10 flex gap-5 md:items-center">
              <div className="mt-1 shrink-0 rounded-full bg-indigo-100 p-3 text-primary ring-1 ring-indigo-200 shadow-sm hidden sm:block">
                <Stethoscope className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-primary-foreground/60 mb-2">
                  New Message From Your Clinical Care Team
                </p>
                <p className="text-xl font-medium text-foreground leading-relaxed max-w-3xl">
                  &quot;{result.clinicianFeedback.note}&quot;
                </p>
                <p className="text-xs font-semibold text-primary-foreground/50 mt-3 block">
                  Sent on {new Date(result.clinicianFeedback.updatedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "summary" && (
          <div className="space-y-4">
            <div
              className={`relative overflow-hidden rounded-3xl p-6 shadow-lg shadow-black/5 ring-1 border-0 ${FOLLOWUP_CALLOUT_STYLES[followupPriority]}`}
              role={followupPriority === "specialist" ? "alert" : undefined}
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none transform translate-x-4 -translate-y-4">
                <AlertTriangle className="h-40 w-40" />
              </div>
              <div className="relative z-10">
                <p className="text-[11px] font-extrabold uppercase tracking-widest opacity-80 mb-2">Clinical follow-up priority</p>
                <p className="text-2xl font-black tracking-tight">{followupLabel}</p>
                <p className="mt-1 text-sm font-medium opacity-90 max-w-xl">{followupSummary}</p>
              </div>
            </div>

              <PatientSimpleCards
                summaryText={
                  reportBundle?.caregiver?.observationsText ??
                  (result.concerns.overallLevel === "none"
                    ? "No notable gait concern signals were detected in this clip."
                    : "This clip shows movement patterns worth reviewing more closely.")
                }
                confidenceText={
                  reportBundle?.caregiver?.confidenceText ?? result.quality.confidenceNotes
                }
                observations={simpleCardObservations}
                nextWeekActions={simpleCardActions}
                followupLabel={followupLabel}
                followupSummary={followupSummary}
                followupPriority={followupPriority}
                clinicianQuestions={simpleCardQuestions}
              />

              <details className="rounded-2xl border bg-surface-container-lowest/70 p-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Advanced details for deeper review
                </summary>

                <div className="mt-3 space-y-4">

            <Card className="bg-surface-container-lowest">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">What This Means Day-To-Day</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {parentImpactRows.length > 0 ? (
                  <div className="space-y-2">
                    {parentImpactRows.map((entry) => (
                      <div key={entry.key} className="rounded-xl border bg-surface-container-low p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">{entry.label}</p>
                          <Badge variant="outline" className={`text-[10px] ${CONCERN_BADGE_STYLES[entry.level]}`}>
                            {CONCERN_PREFIX[entry.level]}: {CONCERN_LABELS[entry.level]}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-foreground/90">{entry.impact}</p>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">Monitor: {entry.monitor}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-foreground/85">
                    No major concern signal was detected in this clip. Keep routine observation and re-record if you notice changes.
                  </p>
                )}
                <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                  These movement signals can reflect motor-control differences, but this tool cannot determine a neurological diagnosis.
                </div>
              </CardContent>
            </Card>

            <Card className="bg-surface-container-lowest">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">Parent Action Plan (Next 7 Days)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-foreground/90">
                <p>1. Keep this result and clinician packet for your next visit.</p>
                <p>2. Track if the observed walking pattern changes with fatigue, speed, or longer distance.</p>
                <p>3. If falls, instability, or asymmetry increase, move follow-up earlier.</p>
                <p>4. Capture one additional clip in good lighting for comparison.</p>
              </CardContent>
            </Card>

            {supplementalMotorMetadata && (
              <Card className="border-amber-300 bg-amber-50/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-amber-900">
                    Supplemental motor context attached
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-amber-900/90">
                  <p>
                    Motor milestone screening was added after this gait analysis as supportive context.
                  </p>
                  <p>
                    Use both outputs together for follow-up planning, not as a standalone diagnosis.
                  </p>
                  {motorSummaryTimestamp && (
                    <p className="text-[11px] text-amber-900/70">
                      Added: {new Date(motorSummaryTimestamp).toLocaleString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="bg-surface-container-lowest">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">
                  {supplementalMotorMetadata
                    ? "Supplemental Motor Development Snapshot"
                    : "Motor Development Snapshot"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-foreground/90">
                {false && sessionClinicalAssessment?.motorDelayAssessment ? (
                  <>
                    <p>
                      <strong>Status:</strong>{" "}
                      {sessionClinicalAssessment?.motorDelayAssessment?.delayFlag === "concern"
                        ? "Evaluation recommended"
                        : sessionClinicalAssessment?.motorDelayAssessment?.delayFlag === "watch"
                          ? "Monitor closely"
                          : "On track"}
                    </p>
                    <p>{sessionClinicalAssessment?.motorDelayAssessment?.summaryNote ?? "Motor milestone summary was captured for this session."}</p>
                    {typeof sessionClinicalAssessment?.motorDelayAssessment?.expectedFromPriorCount === "number" &&
                      typeof sessionClinicalAssessment?.motorDelayAssessment?.achievedFromPriorCount === "number" && (
                        <p className="text-xs text-muted-foreground">
                          Milestones achieved from prior stages: {sessionClinicalAssessment?.motorDelayAssessment?.achievedFromPriorCount} /
                          {" "}{sessionClinicalAssessment?.motorDelayAssessment?.expectedFromPriorCount}
                        </p>
                      )}
                    {supplementalMotorMetadata && (
                      <p className="text-xs text-muted-foreground">
                        Source: Optional motor check added after gait analysis.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No motor milestone screening output is attached to this gait run yet.
                  </p>
                )}
                {(sessionClinicalAssessment?.redFlags?.length ?? 0) > 0 && (
                  <p className="text-xs font-medium text-foreground/85">
                    Additional caregiver red flags noted: {sessionClinicalAssessment?.redFlags?.length}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-surface-container-lowest">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">What We Noticed In This Video</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {CONCERN_DOMAINS.map((domain) => {
                  const level = toConcernLevel(
                    String(result.concerns[domain.key as keyof typeof result.concerns])
                  );
                  const isSuppressed = result.concerns.suppressedDomains.includes(domain.key);

                  if (isSuppressed) {
                    return (
                      <div key={domain.key} className="flex items-center justify-between rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-3">
                        <div>
                          <p className="text-sm font-semibold">{domain.label}</p>
                          <p className="text-sm text-foreground/80">{domain.desc}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-100 text-amber-900">
                          Not assessed
                        </Badge>
                      </div>
                    );
                  }

                  return (
                    <div key={domain.key} className="flex items-center justify-between rounded-2xl bg-surface-container-low p-3">
                      <div>
                        <p className="text-sm font-semibold">{domain.label}</p>
                        <p className="text-sm text-foreground/80">{domain.desc}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${CONCERN_BADGE_STYLES[level] ?? ""}`}
                      >
                        {CONCERN_PREFIX[level]}: {CONCERN_LABELS[level]}
                      </Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {result.concerns.suppressedDomains.length > 0 && (
              <Card className="bg-surface-container-lowest">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold">What Could Not Be Assessed Clearly</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-foreground/85">
                  <p>
                    Some movement areas did not have enough signal quality for a dependable interpretation in this recording.
                  </p>
                  <p>
                    <strong>Not assessed:</strong>{" "}
                    {result.concerns.suppressedDomains.map(formatDomainLabel).join(", ")}
                  </p>
                </CardContent>
              </Card>
            )}

            <Card className="bg-surface-container-lowest">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">Tips For A Better Next Recording</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-foreground/85">
                {practicalRetakeTips.map((tip) => (
                  <p key={tip} className="flex items-start gap-2">
                    <span className="mt-px">-</span>
                    <span>{tip}</span>
                  </p>
                ))}
              </CardContent>
            </Card>

            {reportBundle && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold">What To Do Next</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-foreground/85">
                  <p><strong>Monitoring:</strong> {reportBundle.caregiver.monitoringGuidance}</p>
                  <p><strong>Professional follow-up:</strong> {reportBundle.caregiver.professionalEvalGuidance}</p>
                  <details className="rounded-md border bg-muted/20 p-2">
                    <summary className="cursor-pointer">See clip limitations</summary>
                    <p className="mt-2">{reportBundle.caregiver.limitationsText}</p>
                  </details>
                  <p className="text-xs text-muted-foreground">{reportBundle.caregiver.disclaimerText}</p>
                </CardContent>
              </Card>
            )}

            <Card className="bg-surface-container-lowest">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">Report Sync Status</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-foreground/85">
                This caregiver summary and clinician packet are now attached to this result and available in your local History page as a lightweight parent dashboard.
              </CardContent>
            </Card>

              </div>
            </details>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap gap-3">
              <Button
                variant="outline"
                className="flex-1 min-w-[160px] gap-2 py-6 text-sm font-semibold rounded-2xl bg-card/70 backdrop-blur border-border/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-card text-foreground/90 transition-all duration-300"
                onClick={() => router.push(`/concern?mode=supplemental&resultId=${resultId}`)}
              >
                <Activity className="h-4 w-4 text-emerald-500" />
                <span className="truncate">{hasMotorScreenAttached ? "Update motor check" : "Run motor check"}</span>
              </Button>
              <Button
                variant="outline"
                className="flex-1 min-w-[160px] gap-2 py-6 text-sm font-semibold rounded-2xl bg-card/70 backdrop-blur border-border/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-card text-foreground/90 transition-all duration-300"
                onClick={() => router.push(`/results/${resultId}/refine`)}
              >
                <MessageSquare className="h-4 w-4 text-indigo-500" />
                Add clinician notes
              </Button>
              <Button
                variant="outline"
                className="flex-1 min-w-[160px] gap-2 py-6 text-sm font-semibold rounded-2xl bg-card/70 backdrop-blur border-border/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-card text-foreground/90 transition-all duration-300"
                onClick={() => router.push(`/results/${resultId}/clinician`)}
              >
                <Stethoscope className="h-4 w-4 text-blue-500" />
                Open packet
              </Button>
              {hasTrace && (
                <Button
                  variant="outline"
                  className="flex-1 min-w-[160px] gap-2 py-6 text-sm font-semibold rounded-2xl bg-card/70 backdrop-blur border-border/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-card text-foreground/90 transition-all duration-300"
                  onClick={() => setActiveTab("video")}
                >
                  <PlayCircle className="h-4 w-4 text-amber-500" />
                  View video
                </Button>
              )}
              <Button
                variant="outline"
                className="flex-1 min-w-[160px] gap-2 py-6 text-sm font-semibold rounded-2xl bg-card/70 backdrop-blur border-border/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-card text-foreground/90 transition-all duration-300"
                onClick={() => {
                  const session = readSession<{
                    nickname?: string;
                    ageMonths?: number;
                  }>() ?? {};
                  // Build flat metrics map from feature values
                  const metricsMap: Record<string, number | string> = {};
                  if (result.features) {
                    for (const [key, val] of Object.entries(result.features)) {
                      if (val && typeof val === 'object' && 'value' in val) {
                        metricsMap[key] = (val as { value: number }).value;
                      }
                    }
                  }
                  exportReportAsPDF({
                    childNickname: session.nickname || "Unknown",
                    ageMonths: session.ageMonths || 0,
                    assessmentDate: new Date().toLocaleDateString(),
                    assessmentId: resultId,
                    concerns: result.concerns as unknown as Record<string, string>,
                    metrics: metricsMap,
                    qualityTier: result.quality?.result || "unknown",
                    assessmentMode: result.quality?.assessmentMode || "unknown",
                    confidenceNotes: result.quality?.confidenceNotes
                      ? [result.quality.confidenceNotes].flat()
                      : [],
                  });
                }}
                id="btn-export-pdf"
              >
                <Download className="h-4 w-4 text-emerald-500" />
                <span className="truncate">Export PDF</span>
              </Button>
              <Button
                variant="outline"
                className="flex-1 min-w-[160px] gap-2 py-6 text-sm font-semibold rounded-2xl bg-card/70 backdrop-blur border-border/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-card text-foreground/90 transition-all duration-300 w-full md:w-auto"
                onClick={() => router.push("/capture")}
              >
                <Camera className="h-4 w-4 text-muted-foreground" />
                Record another clip
              </Button>
            </div>
          </div>
        )}

        {activeTab === "video" && (
          <div className="space-y-4">
            <Card className="bg-surface-container-low">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold">Hero artifact status</p>
                  <p className="text-xs text-muted-foreground">
                    {exportAvailable
                      ? "An exported annotated hero clip is available."
                      : "No exported hero clip is present yet. The live player below is the current browser preview."}
                  </p>
                </div>
                {exportAvailable && result.run.exportArtifactPath && (
                  <a href={result.run.exportArtifactPath} download className="inline-flex">
                    <Button variant="secondary" className="gap-2 text-xs">
                      <Download className="h-3.5 w-3.5" />
                      Download Hero MP4
                    </Button>
                  </a>
                )}
              </CardContent>
            </Card>

            <Card className="bg-surface-container-lowest">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">Key Moments In This Clip</CardTitle>
              </CardHeader>
              <CardContent>
                {assistantIssueHotspots.length > 0 ? (
                  <div className="space-y-2">
                    {assistantIssueHotspots.map((spot) => (
                      <div key={spot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-surface-container-low p-2.5">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{spot.title}</p>
                          <p className="text-xs text-muted-foreground">{spot.description}</p>
                        </div>
                        {canJumpToVideo ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => handleFocusIssue(spot.frameIndex)}
                          >
                            Jump to this moment
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/70 italic">
                            Video not available
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No specific key moments were extracted from this clip.
                  </p>
                )}
              </CardContent>
            </Card>

            {hasTrace && hasVideo ? (
              <AnnotatedVideoPlayer
                trace={result.trace!}
                videoUrl={videoUrl!}
                jumpToFrameIndex={jumpToFrameIndex}
              />
            ) : hasTrace && !hasVideo ? (
              <div className="text-center py-12 space-y-3">
                <Video className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  The original video is no longer available in local storage.
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Record a new clip if you want an updated annotated playback.
                </p>
              </div>
            ) : (
              <div className="text-center py-12 space-y-3">
                <PlayCircle className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Hero video playback needs a real analysis trace and a retained clip.
                </p>
              </div>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          className="w-full text-xs text-muted-foreground gap-2"
          onClick={() => router.push("/start")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to start
        </Button>
      </div>

      <div className="fixed bottom-3 right-3 z-50 flex flex-col items-end gap-2 print:hidden sm:bottom-4 sm:right-4">
        {isAssistantOpen && (
          <div
            id="ai-assistant-panel"
            className="h-[clamp(22rem,68dvh,42rem)] max-h-[calc(100dvh-4.5rem)] w-[min(34rem,calc(100vw-1rem))] overflow-hidden rounded-2xl shadow-2xl"
          >
            <AssistantPanel
              resultId={result.id}
              metrics={assistantMetrics}
              risk_category={assistantRiskCategory}
              context={assistantContext}
              issueHotspots={assistantIssueHotspots}
              isOpen={isAssistantOpen}
              onFocusIssue={handleFocusIssue}
              onToggle={() => setIsAssistantOpen(false)}
            />
          </div>
        )}

        <Button
          id="assistant-toggle-button"
          variant="outline"
          size="sm"
          onClick={() => setIsAssistantOpen((prev) => !prev)}
          className="shadow-lg"
          aria-expanded={isAssistantOpen}
          aria-controls="ai-assistant-panel"
        >
          <MessageCircle className="mr-2 h-5 w-5" />
          {isAssistantOpen ? "Close Assistant" : "Ask AI"}
        </Button>
      </div>
    </div>
  );
}
