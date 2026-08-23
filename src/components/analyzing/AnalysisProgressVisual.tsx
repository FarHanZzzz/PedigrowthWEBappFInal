"use client";

import {
  Activity,
  BarChart3,
  CheckCircle2,
  FileText,
  Loader2,
  Scan,
  Video,
} from "lucide-react";

const STAGE_ICONS = [Video, Scan, Activity, Scan, BarChart3, FileText, CheckCircle2] as const;

interface AnalysisProgressVisualProps {
  currentStage: number;
  stageProgress: number;
  overallProgress: number;
  stageLabel: string;
}

export default function AnalysisProgressVisual({
  currentStage,
  stageProgress,
  overallProgress,
  stageLabel,
}: AnalysisProgressVisualProps) {
  const activeIndex = Math.min(currentStage, STAGE_ICONS.length - 1);
  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference - (overallProgress / 100) * circumference;

  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="analysis-orbit absolute inset-0 rounded-full bg-primary/5 blur-2xl" aria-hidden />

      <div className="relative mx-auto flex aspect-square w-full max-w-[280px] items-center justify-center">
        <svg
          viewBox="0 0 140 140"
          className="absolute inset-0 h-full w-full -rotate-90"
          aria-hidden
        >
          <circle
            cx="70"
            cy="70"
            r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-muted/50"
          />
          <circle
            cx="70"
            cy="70"
            r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            className="text-primary transition-[stroke-dashoffset] duration-500"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>

        <div className="analysis-scan-ring absolute inset-[12%] rounded-full border border-primary/20" aria-hidden />

        <div className="relative z-10 flex flex-col items-center gap-3 px-6 text-center">
          <div className="analysis-pose-figure relative h-28 w-20">
            <svg viewBox="0 0 80 112" className="h-full w-full text-primary" aria-hidden>
              <circle cx="40" cy="14" r="8" fill="currentColor" className="analysis-landmark analysis-landmark-1" />
              <line x1="40" y1="22" x2="40" y2="52" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <line x1="40" y1="32" x2="22" y2="48" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <line x1="40" y1="32" x2="58" y2="48" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <line x1="40" y1="52" x2="28" y2="82" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <line x1="40" y1="52" x2="52" y2="82" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <line x1="28" y1="82" x2="24" y2="104" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <line x1="52" y1="82" x2="56" y2="104" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <circle cx="22" cy="48" r="4" fill="currentColor" className="analysis-landmark analysis-landmark-2" />
              <circle cx="58" cy="48" r="4" fill="currentColor" className="analysis-landmark analysis-landmark-3" />
              <circle cx="28" cy="82" r="4" fill="currentColor" className="analysis-landmark analysis-landmark-4" />
              <circle cx="52" cy="82" r="4" fill="currentColor" className="analysis-landmark analysis-landmark-5" />
              <circle cx="24" cy="104" r="4" fill="currentColor" className="analysis-landmark analysis-landmark-6" />
              <circle cx="56" cy="104" r="4" fill="currentColor" className="analysis-landmark analysis-landmark-7" />
            </svg>
            <div className="analysis-scan-line absolute inset-x-2 top-0 h-0.5 rounded-full bg-primary/70" aria-hidden />
          </div>

          <div>
            <p className="text-sm font-semibold">{stageLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {Math.round(overallProgress)}% complete
              {stageProgress > 0 && stageProgress < 100 ? ` · step ${stageProgress}%` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2">
        {STAGE_ICONS.map((Icon, index) => {
          const isComplete = index < activeIndex;
          const isActive = index === activeIndex;
          return (
            <span
              key={index}
              className={`inline-flex size-9 items-center justify-center rounded-full border transition-all duration-300 ${
                isComplete
                  ? "border-primary/30 bg-primary/15 text-primary"
                  : isActive
                    ? "analysis-stage-active border-primary bg-primary text-primary-foreground shadow-[0_0_18px_rgba(2,128,144,0.35)]"
                    : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              {isActive ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
