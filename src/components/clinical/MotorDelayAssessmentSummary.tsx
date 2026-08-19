// PEDI-GROWTH — Motor Delay Assessment Summary (Clinician View)
// ====================================================================
// Displays the structured motor delay assessment results in the
// clinician handoff packet. Shows progress bar, milestones grouped by
// age band with category badges, and the computed delay flag.
//
// This component reads pre-computed data and renders a read-only
// summary. It is used in the clinician page for Route A children.
// ====================================================================

"use client";

import { AlertTriangle, CheckCircle2, Clock, Baby } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MotorDelayAssessment } from "@/lib/clinical/frameworks";

interface MotorDelayAssessmentSummaryProps {
  /** The computed motor delay assessment data */
  assessment: MotorDelayAssessment;
  /** Child's age in months for context */
  ageMonths: number;
  /** Child's name/nickname for display */
  childName: string;
}

const DELAY_FLAG_CONFIG = {
  none: {
    label: "No Delay Indicators",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
    headerBg: "bg-gradient-to-r from-emerald-400 to-emerald-500 text-emerald-950",
    barColor: "bg-emerald-400",
  },
  watch: {
    label: "Monitor Closely",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    icon: Clock,
    headerBg: "bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950",
    barColor: "bg-amber-400",
  },
  concern: {
    label: "Evaluation Recommended",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    icon: AlertTriangle,
    headerBg: "bg-gradient-to-r from-red-500 to-red-600 text-white",
    barColor: "bg-red-400",
  },
} as const;

/**
 * MotorDelayAssessmentSummary — Renders the structured motor delay
 * assessment results for the clinician's review.
 */
export default function MotorDelayAssessmentSummary({
  assessment,
  ageMonths,
  childName,
}: MotorDelayAssessmentSummaryProps) {
  const config = DELAY_FLAG_CONFIG[assessment.delayFlag];

  return (
    <Card className="print-section overflow-hidden">
      {/* ── Severity Header Strip ──────────────────────────────── */}
      <div className={`px-5 py-4 ${config.headerBg}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card/20 backdrop-blur-sm">
            <Baby className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold">
              Motor Milestone Assessment (Route A)
            </h3>
            <p className="text-xs opacity-90 mt-0.5">
              {childName}, {ageMonths} months — {config.label}
            </p>
          </div>
        </div>
      </div>

      <CardContent className="p-5 space-y-4">
        {/* ── Progress Bar ────────────────────────────────────── */}
        {assessment.expectedFromPriorCount > 0 && (
          <div className="rounded-xl bg-muted/20 border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-foreground">
                Prior-stage milestones achieved
              </span>
              <span className="text-xs font-bold text-foreground tabular-nums">
                {assessment.achievedFromPriorCount} / {assessment.expectedFromPriorCount}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted/50 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${config.barColor}`}
                style={{
                  width: `${Math.round(
                    (assessment.achievedFromPriorCount /
                      assessment.expectedFromPriorCount) *
                      100
                  )}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {assessment.summaryNote}
            </p>
          </div>
        )}

        {/* ── Delayed Milestones Grouped by Age Band ──────────── */}
        {assessment.delayedByBand && assessment.delayedByBand.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
              Milestones not achieved — by developmental stage ({assessment.delayedMilestones.length})
            </p>
            {assessment.delayedByBand.map((band) => (
              <div
                key={band.bandLabel}
                className="rounded-xl border border-red-200/60 overflow-hidden"
              >
                <div className="bg-red-50 px-4 py-2 flex items-center gap-2 border-b border-red-200/40">
                  <span className="text-[11px] font-bold text-red-700 uppercase tracking-wide">
                    {band.bandLabel}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[9px] bg-red-100 text-red-600 border-red-200"
                  >
                    {band.milestones.length} not achieved
                  </Badge>
                </div>
                <div className="divide-y divide-red-100/50">
                  {band.milestones.map((m) => (
                    <div key={m.id} className="px-4 py-2.5 flex items-start gap-3">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground leading-snug">
                          {m.label}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="outline"
                            className={`text-[8px] px-1.5 py-0 ${
                              m.category === "gross_motor"
                                ? "bg-blue-50 text-blue-600 border-blue-200"
                                : m.category === "fine_motor"
                                  ? "bg-purple-50 text-purple-600 border-purple-200"
                                  : "bg-teal-50 text-teal-600 border-teal-200"
                            }`}
                          >
                            {m.category === "gross_motor"
                              ? "Gross Motor"
                              : m.category === "fine_motor"
                                ? "Fine Motor"
                                : "Postural"}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground/60">
                            Expected by {m.expectedByMonths}mo
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Missing current-band milestones (informational) ──── */}
        {assessment.missingMilestones.length > 0 && (
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Current-stage milestones not yet observed ({assessment.missingMilestones.length})
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {assessment.missingMilestones.map((milestone, index) => (
                <li key={index}>{milestone}</li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground/70">
              These are within the expected developmental window and may be emerging.
            </p>
          </div>
        )}

        {/* ── AIMS observations (for ≤18mo only) ──────────────── */}
        {assessment.unobservedAIMSItems.length > 0 && (
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              AIMS-inspired observations not confirmed ({assessment.unobservedAIMSItems.length})
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {assessment.unobservedAIMSItems.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Screening note ──────────────────────────────────── */}
        <div className="rounded-lg bg-surface-container-low p-2.5 text-[11px] text-muted-foreground text-center">
          This assessment is a structured screening checklist based on caregiver observations. It
          does not replace formal clinical evaluation with validated instruments (AIMS, Bayley-4, DAYC-2).
        </div>
      </CardContent>
    </Card>
  );
}
