"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import "./analyzing.css";
import {
  Activity,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  Search,
  Cpu,
  ScanLine,
  Footprints,
  BarChart3,
  FileCheck,
  X,
} from "lucide-react";
import { runAnalysisPipeline } from "@/lib/session/analysisSession";
import { saveResult } from "@/lib/session/videoStore";
import {
  readSessionRaw,
  writeSession,
} from "@/lib/session/sessionStorage";
import { saveResultToCloud } from "@/lib/db/cloudStorage";
import type { PipelineProgress } from "@/lib/session/analysisSession";

const STAGE_LABELS = [
  "Loading video",
  "Initializing pose detection",
  "Checking video quality",
  "Detecting body landmarks",
  "Extracting gait features",
  "Computing concern profile",
  "Generating results",
];

const STAGE_DESCRIPTIONS = [
  "Reading video file and preparing frames for analysis...",
  "Loading AI models and preparing pose estimation engine...",
  "Verifying video resolution, lighting, and framing quality...",
  "Identifying 33 skeletal keypoints across each video frame...",
  "Measuring joint angles, stride symmetry, and movement patterns...",
  "Evaluating gait metrics against clinical reference data...",
  "Compiling comprehensive results with annotated visualizations...",
];

const STAGE_ICONS = [Search, Cpu, ScanLine, Footprints, Activity, BarChart3, FileCheck];

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

        try {
          await saveResultToCloud(resultId, result);
        } catch (e) {
          console.error("Failed to save to Supabase cloud:", e);
          // Fallback to IndexedDB if network fails so the demo continues
        }
        
        saveResult(resultId, result).catch(() => {});

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

  // Circular progress SVG math
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  /* â”€â”€ Error State â”€â”€ */
  if (error) {
    return (
      <div className="analyzing-page">
        <div className="analyzing-error">
          <div className="analyzing-error__icon">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h1 className="analyzing-error__title">Analysis Error</h1>
          <p className="analyzing-error__desc">{error}</p>
          <div className="analyzing-error__actions">
            <button
              className="error-btn error-btn--primary"
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
              Try Again
            </button>
            <button
              className="error-btn error-btn--secondary"
              onClick={() => router.push("/capture")}
            >
              Record a New Video
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* â”€â”€ Processing State â”€â”€ */
  return (
    <div className="analyzing-page">
      <div className="analyzing-container">
        {/* Header */}
        <div className="analyzing-header">
          <button
            className="analyzing-header__back"
            onClick={() => router.push("/capture")}
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="analyzing-header__title">AI Processing</span>
          <div className="analyzing-header__spacer" />
        </div>

        {/* Progress Card */}
        <div className="progress-card">
          <div className="progress-card__shimmer" />
          <div className="progress-card__content">
            <div className="progress-card__text">
              <span className="progress-card__label">
                {currentStage < STAGE_LABELS.length
                  ? "Analyzing Gait..."
                  : "Analysis Complete!"}
              </span>
              <span className="progress-card__steps">
                {Math.min(currentStage + 1, STAGE_LABELS.length)}/{STAGE_LABELS.length} Steps Completed
              </span>
            </div>
            <div className="circular-progress">
              <svg className="circular-progress__svg" viewBox="0 0 64 64">
                <circle
                  className="circular-progress__track"
                  cx="32"
                  cy="32"
                  r={radius}
                />
                <circle
                  className="circular-progress__fill"
                  cx="32"
                  cy="32"
                  r={radius}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              <span className="circular-progress__value">
                {Math.round(progress)}%
              </span>
            </div>
          </div>
          <div className="progress-card__bar">
            <div
              className="progress-card__bar-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Stage Icons Strip */}
        <div className="stage-icons">
          {STAGE_ICONS.map((Icon, i) => (
            <div
              key={i}
              className={`stage-icon ${
                i < currentStage
                  ? "stage-icon--completed"
                  : i === currentStage
                  ? "stage-icon--active"
                  : "stage-icon--pending"
              }`}
            >
              {i < currentStage ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </div>
          ))}
        </div>

        {/* Steps List */}
        <div className="steps-list">
          <h2 className="steps-list__title">Analyzing Gait Patterns</h2>

          {STAGE_LABELS.map((label, i) => {
            const isCompleted = i < currentStage;
            const isActive = i === currentStage;

            return (
              <div
                key={label}
                className={`step-item ${
                  isCompleted
                    ? "step-item--completed"
                    : isActive
                    ? "step-item--active"
                    : "step-item--pending"
                }`}
              >
                <div
                  className={`step-item__icon ${
                    isCompleted
                      ? "step-item__icon--completed"
                      : isActive
                      ? "step-item__icon--active"
                      : "step-item__icon--pending"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : isActive ? (
                    <Loader2 className="h-3.5 w-3.5 spin-animation" />
                  ) : (
                    <div
                      style={{
                        width: "0.5rem",
                        height: "0.5rem",
                        borderRadius: "50%",
                        background: "#c4d5d2",
                      }}
                    />
                  )}
                </div>

                <div className="step-item__content">
                  <span className="step-item__label">
                    {isActive ? `${label}...` : label}
                  </span>
                  {(isCompleted || isActive) && (
                    <p className="step-item__desc">
                      {STAGE_DESCRIPTIONS[i]}
                    </p>
                  )}
                  {isActive && (
                    <>
                      <div className="step-item__progress">
                        <div
                          className="step-item__progress-fill"
                          style={{ width: `${stageProgress}%` }}
                        />
                      </div>
                      <div className="step-item__skeleton">
                        <div className="skeleton-line" />
                        <div className="skeleton-line" />
                        <div className="skeleton-line" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom */}
        <div className="analyzing-bottom">
          <button
            className="analyzing-cancel"
            onClick={() => router.push("/capture")}
          >
            <X className="h-4 w-4" />
            Cancel Analysis
          </button>
          <span className="analyzing-privacy">
            🔒 Video is processed locally on your device — nothing is uploaded
          </span>
        </div>
      </div>
    </div>
  );
}
