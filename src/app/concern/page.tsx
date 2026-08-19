// PEDI-GROWTH — Concern Navigator (Route A)
// ====================================================================
// This page is shown to caregivers when route_child() sends them to
// Route A (non-ambulant or unknown walking status).
//
// ENHANCED: Now includes:
//   1. Original red-flag checklist (preserved)
//   2. Age-normed motor milestone assessment (Bayley/DAYC-inspired)
//   3. AIMS observational checklist (for infants ≤18 months)
//   4. Computed motor delay flag summary
//   5. Data persistence to sessionStorage for clinician handoff
//
// IMPORTANT: This page does NOT diagnose. It structures observations
// for clinical review. All language is non-diagnostic.
// ====================================================================

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Heart,
  AlertTriangle,
  ArrowLeft,
  Printer,
  Baby,
  ClipboardList,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FOLLOWUP_BADGE_STYLES, FOLLOWUP_CALLOUT_STYLES } from "@/lib/presentation/severity";
import {
  readSession,
  readResultRaw,
  readSessionRaw,
  writeResult,
  writeSession,
} from "@/lib/session/sessionStorage";
import {
  getMilestoneBandsForAge,
  getCurrentBand,
  shouldShowAIMS,
  AIMS_CATEGORIES,
  computeMotorDelayAssessment,
  type MilestoneBand,
} from "@/lib/clinical/frameworks";

// ── Original Red Flags (preserved exactly) ─────────────────────────
const RED_FLAGS = [
  { id: "rf-1", label: "Loss of previously acquired motor skills", urgent: true },
  { id: "rf-2", label: "Significant asymmetry in posture or movement", urgent: true },
  { id: "rf-3", label: "Strong preference for one side of the body", urgent: true },
  { id: "rf-4", label: "Unusual stiffness or floppiness in limbs", urgent: false },
  { id: "rf-5", label: "Not weight-bearing on legs by 12 months", urgent: false },
  { id: "rf-6", label: "Not sitting independently by 9 months", urgent: false },
  { id: "rf-7", label: "Seizures or unusual movements", urgent: true },
];

// ── Session shape for reading intake data ──────────────────────────
interface IntakeSession {
  nickname?: string;
  ageMonths?: number;
  walking?: string;
  route?: string;
  routeReason?: string;
  policyVersion?: string;
  consentTimestamp?: string;
}

interface SupplementalAssessmentMetadata {
  source: "supplemental";
  linkedResultId: string;
  completedAt: string;
}

interface ClinicalAssessmentPayload {
  redFlags: string[];
  urgentRedFlagCount: number;
  motorDelayAssessment: ReturnType<typeof computeMotorDelayAssessment> | null;
  aimsCompleted: boolean;
  assessedAt: string;
  supplementalMetadata?: SupplementalAssessmentMetadata;
}

interface LinkedResultSnapshot {
  session?: {
    nickname?: string;
    ageMonths?: number;
  };
  clinicalAssessment?: unknown;
}

interface ConcernHydrationContext {
  childName: string;
  childAge: number | null;
  resolvedLinkedResultId: string | null;
  supplementalFallbackNotice: string | null;
  seedSession: { nickname: string; ageMonths: number | null } | null;
  shouldRedirect: boolean;
}

function ConcernPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedLinkedResultId = searchParams.get("resultId");
  const requestedSupplementalFlow = searchParams.get("mode") === "supplemental";

  const hydrationContext = useMemo<ConcernHydrationContext>(() => {
    let childName = "your child";
    let childAge: number | null = null;
    let resolvedLinkedResultId: string | null = null;
    let supplementalFallbackNotice: string | null = null;
    let seedSession: { nickname: string; ageMonths: number | null } | null = null;
    let hydratedFromSession = false;

    const rawSession = readSessionRaw();
    if (rawSession) {
      try {
        const parsed = JSON.parse(rawSession) as IntakeSession;
        childName = parsed.nickname || "your child";
        childAge = typeof parsed.ageMonths === "number" ? parsed.ageMonths : null;
        hydratedFromSession = true;
      } catch {
        hydratedFromSession = false;
      }
    }

    if (requestedSupplementalFlow && requestedLinkedResultId) {
      const linkedRaw = readResultRaw(requestedLinkedResultId);
      if (linkedRaw) {
        try {
          const linked = JSON.parse(linkedRaw) as LinkedResultSnapshot;
          resolvedLinkedResultId = requestedLinkedResultId;

          if (!hydratedFromSession) {
            childName = linked.session?.nickname || "your child";
            childAge =
              typeof linked.session?.ageMonths === "number" ? linked.session.ageMonths : null;
            hydratedFromSession = true;
            seedSession = {
              nickname: childName,
              ageMonths: childAge,
            };
          }
        } catch {
          supplementalFallbackNotice =
            "We could not load the linked gait result. Continuing in standard concern mode.";
        }
      } else {
        supplementalFallbackNotice =
          "The linked gait result is no longer available. Continuing in standard concern mode.";
      }
    } else if (requestedSupplementalFlow) {
      supplementalFallbackNotice =
        "Supplemental mode was requested without a linked result. Continuing in standard concern mode.";
    }

    return {
      childName,
      childAge,
      resolvedLinkedResultId,
      supplementalFallbackNotice,
      seedSession,
      shouldRedirect: !hydratedFromSession,
    };
  }, [requestedLinkedResultId, requestedSupplementalFlow]);

  const {
    childName,
    childAge,
    resolvedLinkedResultId,
    supplementalFallbackNotice,
    seedSession,
    shouldRedirect,
  } = hydrationContext;
  const isSupplementalFlow = requestedSupplementalFlow && Boolean(resolvedLinkedResultId);

  useEffect(() => {
    if (seedSession) {
      writeSession(seedSession);
    }
  }, [seedSession]);

  useEffect(() => {
    if (shouldRedirect) {
      router.replace("/start");
    }
  }, [router, shouldRedirect]);

  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [milestoneChecks, setMilestoneChecks] = useState<Record<string, boolean>>({});
  const [aimsChecks, setAimsChecks] = useState<Record<string, boolean>>({});
  const [runtimeSupplementalNotice, setRuntimeSupplementalNotice] = useState<string | null>(null);
  const displayedSupplementalNotice = runtimeSupplementalNotice ?? supplementalFallbackNotice;

  // ── Derived milestone data ─────────────────────────────────────────
  const milestoneBands: MilestoneBand[] = useMemo(() => {
    if (childAge === null) return [];
    return getMilestoneBandsForAge(childAge);
  }, [childAge]);

  const showAIMS = childAge !== null && shouldShowAIMS(childAge);

  const currentBand = useMemo(() => {
    if (childAge === null) return null;
    return getCurrentBand(childAge);
  }, [childAge]);

  // ── Compute motor delay assessment ─────────────────────────────────
  const motorAssessment = useMemo(() => {
    if (childAge === null) return null;
    return computeMotorDelayAssessment(
      childAge,
      new Set(Object.entries(milestoneChecks).filter(([, v]) => v).map(([k]) => k)),
      new Set(Object.entries(aimsChecks).filter(([, v]) => v).map(([k]) => k)),
    );
  }, [childAge, milestoneChecks, aimsChecks]);

  // ── Red flag counts (preserved logic) ──────────────────────────────
  const flaggedCount = Object.values(flags).filter(Boolean).length;
  const urgentCount = RED_FLAGS.filter((rf) => rf.urgent && flags[rf.id]).length;

  // ── Milestone counts ───────────────────────────────────────────────
  const totalMilestones = milestoneBands.flatMap((b) => b.milestones).length;
  const achievedMilestones = Object.values(milestoneChecks).filter(Boolean).length;

  // ── AIMS counts ────────────────────────────────────────────────────
  const totalAIMS = AIMS_CATEGORIES.flatMap((c) => c.items).length;
  const observedAIMS = Object.values(aimsChecks).filter(Boolean).length;

  // ── Persist clinical data to session for clinician handoff ─────────
  function handleSaveAndPrint() {
    // Save the motor delay assessment data to session for results + clinician page.
    const assessedAt = new Date().toISOString();
    const supplementalMetadata =
      isSupplementalFlow && resolvedLinkedResultId
        ? {
            source: "supplemental" as const,
            linkedResultId: resolvedLinkedResultId,
            completedAt: assessedAt,
          }
        : undefined;
    const clinicalAssessmentPayload: ClinicalAssessmentPayload = {
      redFlags: Object.entries(flags)
        .filter(([, v]) => v)
        .map(([k]) => RED_FLAGS.find((rf) => rf.id === k)?.label ?? k),
      urgentRedFlagCount: urgentCount,
      motorDelayAssessment: motorAssessment,
      aimsCompleted: showAIMS,
      assessedAt,
      ...(supplementalMetadata ? { supplementalMetadata } : {}),
    };

    const existing = readSession<IntakeSession>() ?? {};
    writeSession({
      ...existing,
      clinicalAssessment: clinicalAssessmentPayload,
    });

    if (resolvedLinkedResultId) {
      const linkedRaw = readResultRaw(resolvedLinkedResultId);
      if (linkedRaw) {
        try {
          const linked = JSON.parse(linkedRaw) as LinkedResultSnapshot & Record<string, unknown>;
          const linkedSession =
            linked.session && typeof linked.session === "object"
              ? (linked.session as Record<string, unknown>)
              : {};

          const updated = {
            ...linked,
            session: {
              ...linkedSession,
              clinicalAssessment: clinicalAssessmentPayload,
            },
            clinicalAssessment: clinicalAssessmentPayload,
          };
          writeResult(resolvedLinkedResultId, updated);
        } catch {
          // Keep session-level persistence even if linked result payload is malformed.
        }

        router.push(`/results/${resolvedLinkedResultId}`);
        return;
      }

      setRuntimeSupplementalNotice(
        "Motor summary was saved locally, but the linked result could not be reopened. You can still print this summary.",
      );
    }

    window.print();
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl">
        {/* ── Header (preserved) ──────────────────────────────────── */}
        <div className="clinical-layer mb-5 rounded-[1.8rem] px-6 py-7 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container-lowest">
            <Heart className="h-6 w-6 text-route-a" />
          </div>
          <h1 data-display="true" className="text-3xl font-semibold text-foreground">
            {isSupplementalFlow ? "Motor Development Check" : "Concern Navigator"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSupplementalFlow
              ? `This optional screen adds milestone context to ${childName}'s gait result for a stronger parent and clinician handoff.`
              : `Since ${childName} isn&apos;t walking independently yet, we&apos;ll help you organize your observations for a professional conversation.`}
          </p>
          {childAge !== null && (
            <Badge variant="outline" className="mt-2 text-[11px]">
              {childAge} months old
            </Badge>
          )}
        </div>

        {/* ── Why no gait analysis (preserved) ────────────────────── */}
        <Card className="mb-4 bg-surface-container-low">
          <CardContent className="p-4 text-xs text-muted-foreground">
            {isSupplementalFlow ? (
              <p>
                This motor screen is a structured parent-observation add-on. It complements gait analysis by adding developmental context.
              </p>
            ) : (
              <p>
                Gait analysis requires independent walking. When {childName}{" "}
                starts walking, you can come back for a full gait assessment.
              </p>
            )}
          </CardContent>
        </Card>

        {displayedSupplementalNotice && (
          <Card className="mb-4 border-amber-300 bg-amber-50/70">
            <CardContent className="p-4 text-xs text-amber-900">
              {displayedSupplementalNotice}
            </CardContent>
          </Card>
        )}

        {/* ────────────────────────────────────────────────────────── */}
        {/* NEW: Age-Normed Motor Milestone Assessment                */}
        {/* ────────────────────────────────────────────────────────── */}
        {false && milestoneBands.length > 0 && (
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Baby className="h-4 w-4 text-primary" />
                Motor Milestone Check
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Check the milestones {childName} has <strong>already achieved</strong>.
                Unchecked items from earlier age bands may indicate developmental delay.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {milestoneBands.map((band) => {
                // Determine if this is a prior band (child should have these) or current band
                const isPriorBand = currentBand
                  ? band.maxAge < currentBand.minAge
                  : false;

                return (
                  <div key={band.label} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {band.label}
                      </span>
                      {isPriorBand && (
                        <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                          Should be achieved
                        </Badge>
                      )}
                    </div>
                    {band.milestones.map((milestone) => {
                      const isChecked = milestoneChecks[milestone.id] || false;
                      const isDelayed = isPriorBand && !isChecked;

                      return (
                        <div
                          key={milestone.id}
                          className={`flex items-start gap-3 rounded-2xl p-3 transition-colors ${
                            isDelayed
                              ? "bg-red-50/50 border border-red-200"
                              : isChecked
                                ? "bg-emerald-50/50 border border-emerald-200"
                                : "bg-surface-container-low"
                          }`}
                        >
                          <Checkbox
                            id={milestone.id}
                            checked={isChecked}
                            onCheckedChange={(v) =>
                              setMilestoneChecks((p) => ({ ...p, [milestone.id]: v === true }))
                            }
                            className="mt-0.5"
                          />
                          <div className="flex-1">
                            <Label htmlFor={milestone.id} className="text-sm cursor-pointer leading-snug">
                              {milestone.label}
                            </Label>
                            {isChecked && (
                              <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                                <CheckCircle2 className="h-3 w-3" /> Achieved
                              </span>
                            )}
                            {isDelayed && (
                              <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-red-600">
                                <AlertTriangle className="h-3 w-3" /> Not yet achieved
                              </span>
                            )}
                            <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                              {milestone.clinicalNote}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Milestone progress summary */}
              <div className="rounded-xl bg-surface-container-low p-3 text-center text-xs text-muted-foreground">
                {achievedMilestones} of {totalMilestones} milestones confirmed
              </div>
            </CardContent>
          </Card>
        )}

        {/* ────────────────────────────────────────────────────────── */}
        {/* NEW: AIMS Observational Checks (for infants ≤18 months)   */}
        {/* ────────────────────────────────────────────────────────── */}
        {false && showAIMS && (
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4 text-primary" />
                Posture & Movement Observations (AIMS-Inspired)
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Check each movement you have <strong>observed {childName} do</strong>.
                These are based on the Alberta Infant Motor Scale observational categories.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {AIMS_CATEGORIES.map((category) => (
                <div key={category.id} className="space-y-2">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    {category.position} Position
                  </span>
                  {category.items.map((item) => {
                    const isChecked = aimsChecks[item.id] || false;

                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 rounded-2xl p-3 transition-colors ${
                          isChecked
                            ? "bg-emerald-50/50 border border-emerald-200"
                            : "bg-surface-container-low"
                        }`}
                      >
                        <Checkbox
                          id={item.id}
                          checked={isChecked}
                          onCheckedChange={(v) =>
                            setAimsChecks((p) => ({ ...p, [item.id]: v === true }))
                          }
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <Label htmlFor={item.id} className="text-sm cursor-pointer leading-snug">
                            {item.label}
                          </Label>
                          {isChecked && (
                            <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" /> Observed
                            </span>
                          )}
                          <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                            💡 {item.observationTip}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* AIMS progress summary */}
              <div className="rounded-xl bg-surface-container-low p-3 text-center text-xs text-muted-foreground">
                {observedAIMS} of {totalAIMS} movements observed
              </div>
            </CardContent>
          </Card>
        )}

        {/* ────────────────────────────────────────────────────────── */}
        {/* Motor Delay Assessment Summary (REVAMPED — grouped UI)    */}
        {/* ────────────────────────────────────────────────────────── */}
        {false && motorAssessment && (
          <Card className="mb-4 overflow-hidden">
            {/* ── Severity Header Strip ──────────────────────────── */}
            <div
              className={`px-5 py-4 ${
                motorAssessment?.delayFlag === "concern"
                  ? "bg-linear-to-r from-red-500 to-red-600 text-white"
                  : motorAssessment?.delayFlag === "watch"
                    ? "bg-linear-to-r from-amber-400 to-amber-500 text-amber-950"
                    : "bg-linear-to-r from-emerald-400 to-emerald-500 text-emerald-950"
              }`}
            >
              <div className="flex items-center gap-3">
                {motorAssessment?.delayFlag === "concern" ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card/20 backdrop-blur-sm">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                ) : motorAssessment?.delayFlag === "watch" ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card/20 backdrop-blur-sm">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card/20 backdrop-blur-sm">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-bold">
                    Motor Milestone Screening Result
                  </h3>
                  <p className="text-xs opacity-90 mt-0.5">
                    {motorAssessment?.delayFlag === "concern"
                      ? "Evaluation Recommended"
                      : motorAssessment?.delayFlag === "watch"
                        ? "Monitor Closely"
                        : "On Track"}
                  </p>
                </div>
              </div>
            </div>

            <CardContent className="p-5 space-y-4">
              {/* ── Progress Summary Bar ─────────────────────────── */}
              {((motorAssessment?.expectedFromPriorCount) ?? 0) > 0 && (
                <div className="rounded-xl bg-surface-container-low p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-foreground">
                      Prior-stage milestones achieved
                    </span>
                    <span className="text-xs font-bold text-foreground tabular-nums">
                      {motorAssessment?.achievedFromPriorCount} / {motorAssessment?.expectedFromPriorCount}
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        motorAssessment?.delayFlag === "concern"
                          ? "bg-red-400"
                          : motorAssessment?.delayFlag === "watch"
                            ? "bg-amber-400"
                            : "bg-emerald-400"
                      }`}
                      style={{
                        width: `${Math.round(
                          ((motorAssessment?.achievedFromPriorCount ?? 0) /
                            (motorAssessment?.expectedFromPriorCount ?? 1)) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {motorAssessment?.summaryNote}
                  </p>
                </div>
              )}

              {/* ── Delayed Milestones Grouped by Age Band ────────── */}
              {((motorAssessment?.delayedByBand?.length) ?? 0) > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Milestones not achieved — by age stage
                  </p>
                  {motorAssessment?.delayedByBand?.map((band) => (
                    <div
                      key={band.bandLabel}
                      className="rounded-xl border border-red-200/60 overflow-hidden"
                    >
                      {/* Band header */}
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
                      {/* Milestone items */}
                      <div className="divide-y divide-red-100/50">
                        {band.milestones.map((m) => (
                          <div key={m.id} className="px-4 py-2.5 flex items-start gap-3 bg-card/50">
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

              {/* ── No Delays — Positive Message ─────────────────── */}
              {((motorAssessment?.delayedByBand?.length) ?? 0) === 0 && (
                <div className="rounded-xl bg-emerald-50/50 border border-emerald-200/60 p-4 text-center">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
                  <p className="text-xs font-medium text-emerald-700">
                    All prior-stage milestones have been achieved
                  </p>
                  <p className="text-[11px] text-emerald-600/70 mt-1">
                    Continue monitoring current-stage milestones for age-appropriate development.
                  </p>
                </div>
              )}

              {/* ── Screening Disclaimer ─────────────────────────── */}
              <div className="rounded-lg bg-surface-container-low p-2.5 text-[11px] text-muted-foreground text-center">
                This structured screening is based on caregiver observations. It does not
                replace formal evaluation with validated instruments (AIMS, Bayley-4, DAYC-2).
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Red flags — quick checklist (PRESERVED — original) ─── */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-concern-significant" />
              Quick observation check
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {RED_FLAGS.map((rf) => (
              <div key={rf.id} className="flex items-start gap-3 rounded-2xl bg-surface-container-low p-3">
                <Checkbox
                  id={rf.id}
                  checked={flags[rf.id] || false}
                  onCheckedChange={(v) => setFlags((p) => ({ ...p, [rf.id]: v === true }))}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor={rf.id} className="text-sm cursor-pointer leading-snug">
                    {rf.label}
                  </Label>
                  {rf.urgent && (
                    <Badge variant="outline" className={`ml-1.5 text-[9px] ${FOLLOWUP_BADGE_STYLES.specialist}`}>
                      Urgent
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Red flag results (PRESERVED — original) ─────────────── */}
        {flaggedCount > 0 && (
          <Card className={`mb-4 ${urgentCount > 0 ? FOLLOWUP_CALLOUT_STYLES.specialist : "bg-tertiary-fixed/30"}`}>
            <CardContent className="p-4 text-xs">
              <p className="font-medium text-foreground mb-1">
                {flaggedCount} observation(s) noted{urgentCount > 0 ? `, including ${urgentCount} priority item(s)` : ""}
              </p>
              <p className="text-muted-foreground">
                We recommend discussing these with your child&apos;s healthcare team.
                {urgentCount > 0 && " Urgent items should be escalated during the next clinical contact."}
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Guidance (PRESERVED — original) ─────────────────────── */}
        <Card className="mb-4 bg-surface-container-low">
          <CardContent className="p-4 space-y-2 text-xs text-foreground/80">
            <p className="font-semibold text-foreground">Suggested next steps:</p>
            <p>• Share your observations with your child&apos;s pediatrician</p>
            <p>• Request a developmental evaluation if you have ongoing concerns</p>
            <p>• When {childName} begins walking independently, come back for gait analysis</p>
            <p>• Take a screenshot of this page to share with your healthcare team</p>
          </CardContent>
        </Card>

        {/* ── Non-diagnostic reminder (PRESERVED — original) ──────── */}
        <div className="mb-4 rounded-2xl bg-surface-container-low p-3 text-xs text-muted-foreground text-center">
          Pedi-Growth supports concern documentation — it does not diagnose conditions.
        </div>

        {/* ── Actions (ENHANCED — now saves clinical data) ─────────── */}
        <div className="space-y-3 pt-2">
          {(flaggedCount > 0 || achievedMilestones > 0) && (
            <Button
              className="w-full gap-2 text-base font-semibold"
              size="lg"
              onClick={handleSaveAndPrint}
            >
              <Printer className="h-4 w-4" />
              {isSupplementalFlow ? "Save motor summary to this result" : "Save & Print Summary (PDF)"}
            </Button>
          )}
          {isSupplementalFlow ? (
            <Button
              variant="secondary"
              className="w-full text-sm font-medium"
              onClick={() =>
                resolvedLinkedResultId ? router.push(`/results/${resolvedLinkedResultId}`) : router.push("/start")
              }
            >
              Back to result (skip for now)
            </Button>
          ) : (
            <Button
              variant="secondary"
              className="w-full text-sm font-medium"
              onClick={() => router.push("/start")}
            >
              Wait, my child is walking (Edit answers)
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={() =>
              router.push(isSupplementalFlow && resolvedLinkedResultId ? `/results/${resolvedLinkedResultId}` : "/")
            }
          >
            <ArrowLeft className="h-3 w-3 mr-1" />
            {isSupplementalFlow ? "Return to results" : "Finish & return home"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConcernPageFallback() {
  return (
    <div className="px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Card className="bg-surface-container-low">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Loading concern workflow...
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ConcernPage() {
  return (
    <Suspense fallback={<ConcernPageFallback />}>
      <ConcernPageContent />
    </Suspense>
  );
}
