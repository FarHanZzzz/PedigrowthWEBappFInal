"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  Download,
  FileText,
  Printer,
  RefreshCw,
  Stethoscope,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import RunProvenanceBadge from "@/components/results/RunProvenanceBadge";
import ResultGuardState from "@/components/results/ResultGuardState";
import AnnotatedVideoPlayer from "@/components/results/AnnotatedVideoPlayer";
import EventTimeline from "@/components/results/EventTimeline";
import KeyFrameGallery from "../../../../components/results/KeyFrameGallery";
import AnalysisTracePanel from "@/components/results/AnalysisTracePanel";
import HowAnalysisWorksPanel from "@/components/results/HowAnalysisWorksPanel";

// ── Clinical assessment components (Motor Delay + GMFCS + GMA) ────
import GMFCSCard from "@/components/clinical/GMFCSCard";
import MotorDelayAssessmentSummary from "@/components/clinical/MotorDelayAssessmentSummary";
import GMAAssessmentCard from "@/components/clinical/GMAAssessmentCard";
import { readSession, writeResult } from "@/lib/session/sessionStorage";
import { saveResultToCloud } from "@/lib/db/cloudStorage";
import type { ClinicianFeedbackPayload } from "@/lib/session/analysisSession";
import type { MotorDelayAssessment, GMAScreeningResult } from "@/lib/clinical/frameworks";
import { isGMAApplicableByMonths } from "@/lib/clinical/frameworks";
import {
  formatDomainLabel,
  useResultViewModel,
} from "@/lib/results/resultViewModel";
import {
  CONCERN_BADGE_STYLES,
  CONCERN_LABELS,
  FOLLOWUP_BADGE_STYLES,
  FOLLOWUP_CALLOUT_STYLES,
  FOLLOWUP_CALLOUT_TEXT,
  FOLLOWUP_LABELS,
  toConcernLevel,
  toFollowupPriority,
} from "@/lib/presentation/severity";

const CONCERN_DOMAINS = [
  { key: "asymmetry", label: "Asymmetry" },
  { key: "irregularRhythm", label: "Rhythm regularity" },
  { key: "lateralInstability", label: "Lateral stability" },
  { key: "pathDeviation", label: "Path deviation" },
] as const;

type ClinicianTab = "snapshot" | "evidence" | "handoff";

const CLINICIAN_TABS: Array<{ key: ClinicianTab; label: string }> = [
  { key: "snapshot", label: "Snapshot" },
  { key: "evidence", label: "Advanced Evidence" },
  { key: "handoff", label: "Handoff & Notes" },
];

interface AiInsightResponse {
  success: boolean;
  source: "ai" | "fallback";
  insightSummary: string;
  nextSteps: string[];
  confidenceQualifier: string;
  disclaimer: string;
}

interface SupplementalAssessmentMetadata {
  source?: "supplemental";
  linkedResultId?: string;
  completedAt?: string;
}

interface ClinicalAssessmentData {
  redFlags?: string[];
  urgentRedFlagCount?: number;
  motorDelayAssessment?: MotorDelayAssessment | null;
  aimsCompleted?: boolean;
  assessedAt?: string;
  supplementalMetadata?: SupplementalAssessmentMetadata;
}

export default function ClinicianResultPage() {
  const params = useParams();
  const router = useRouter();
  const resultId = params.id as string;
  const noteStorageKey = `gaitbridge_clinician_note_${resultId}`;

  const [activeTab, setActiveTab] = useState<ClinicianTab>("snapshot");
  const [jumpToFrameIndex, setJumpToFrameIndex] = useState<number | null>(null);
  const [aiInsight, setAiInsight] = useState<AiInsightResponse | null>(null);
  const [isGeneratingAiInsight, setIsGeneratingAiInsight] = useState(false);
  const [aiInsightError, setAiInsightError] = useState<string | null>(null);
  const [clinicianNote, setClinicianNote] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    try {
      return window.localStorage.getItem(noteStorageKey) ?? "";
    } catch {
      return "";
    }
  });
  const hasHydratedClinicianFeedback = useRef(false);
  const [publishedFeedbackAt, setPublishedFeedbackAt] = useState<string | null>(null);
  const [feedbackSyncStatus, setFeedbackSyncStatus] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [shareLinkStatus, setShareLinkStatus] = useState<string | null>(null);
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false);

  // ── Clinical assessment data from Route A (Concern Navigator) ────
  // This data is persisted by the concern page when the parent completes
  // the motor milestone and AIMS checklists. It is read here for display.
  const [clinicalAssessmentData, setClinicalAssessmentData] = useState<ClinicalAssessmentData | null>(null);
  // ── GMA Screening Result — read from session if parent completed GMA checklist ──
  const [gmaResult, setGmaResult] = useState<GMAScreeningResult | null>(null);

  useEffect(() => {
    // Read clinical assessment from session (set by concern/page.tsx)
    const session = readSession<{
      clinicalAssessment?: ClinicalAssessmentData;
      gmaScreeningResult?: GMAScreeningResult;
    }>();
    if (session?.clinicalAssessment) {
      setClinicalAssessmentData(session.clinicalAssessment);
    }
    if (session?.gmaScreeningResult) {
      setGmaResult(session.gmaScreeningResult);
    }
  }, []);

  const {
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
  } = useResultViewModel(resultId);

  useEffect(() => {
    if (clinicalAssessmentData || !result) {
      return;
    }

    const embedded =
      (result as { clinicalAssessment?: ClinicalAssessmentData }).clinicalAssessment ??
      ((result.session as { clinicalAssessment?: ClinicalAssessmentData } | undefined)
        ?.clinicalAssessment ?? null);

    if (embedded) {
      setClinicalAssessmentData(embedded);
    }
  }, [clinicalAssessmentData, result]);

  const evidenceByDomain = useMemo(
    () => new Map(concernEvidence.map((entry) => [entry.domain, entry])),
    [concernEvidence]
  );

  useEffect(() => {
    if (hasHydratedClinicianFeedback.current || !result) {
      return;
    }

    const persistedFeedback = result.clinicianFeedback;
    if (persistedFeedback?.note) {
      setClinicianNote(persistedFeedback.note);
      setPublishedFeedbackAt(persistedFeedback.updatedAt);
    }

    hasHydratedClinicianFeedback.current = true;
  }, [result]);

  useEffect(() => {
    try {
      if (clinicianNote.trim().length === 0) {
        window.localStorage.removeItem(noteStorageKey);
        return;
      }

      window.localStorage.setItem(noteStorageKey, clinicianNote);
    } catch {
      // Ignore local storage access errors in restricted browsing contexts.
    }
  }, [clinicianNote, noteStorageKey]);

  useEffect(() => {
    if (!feedbackSyncStatus) {
      return;
    }

    const timer = window.setTimeout(() => setFeedbackSyncStatus(null), 4500);
    return () => window.clearTimeout(timer);
  }, [feedbackSyncStatus]);

  useEffect(() => {
    if (!shareLinkStatus) {
      return;
    }

    const timer = window.setTimeout(() => setShareLinkStatus(null), 4000);
    return () => window.clearTimeout(timer);
  }, [shareLinkStatus]);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 bg-surface-container-low/50">
        <div className="space-y-4 text-center">
          <RefreshCw className="h-10 w-10 text-muted-foreground/50 mx-auto animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Loading clinical assessment...</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="space-y-4 text-center">
          <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Result not found. It may have expired.</p>
          <Button onClick={() => router.push("/start")} variant="outline">
            Start Over
          </Button>
        </div>
      </div>
    );
  }

  if (isValidationFailure || isCannotAssessRealRun) {
    return <ResultGuardState result={result} />;
  }

  const overallConcernLevel = toConcernLevel(result.concerns.overallLevel);
  const overallConcernLabel = CONCERN_LABELS[overallConcernLevel];
  const followUpPriority = toFollowupPriority(result.concerns.followupPriority);
  const followUpRecommendation = FOLLOWUP_LABELS[followUpPriority];
  const assessedDomains = result.concerns.assessedDomains.map(formatDomainLabel);
  const suppressedDomains = result.concerns.suppressedDomains.map(formatDomainLabel);
  const assessedDomainsSummary = assessedDomains.length > 0 ? assessedDomains.join(", ") : "None";
  const notAssessedDomainsSummary = suppressedDomains.length > 0 ? suppressedDomains.join(", ") : "None";
  const notCapturedInWorkflow = "Not captured in current workflow";
  const reportIntakeContext = (result.reports?.clinician?.intakeContext ?? {}) as Record<string, unknown>;
  const sessionIntakeContext = (result.session.intakeContext ?? {}) as Record<string, unknown>;

  const normalizeContextValue = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const contextValue = (primary: unknown, secondary: unknown): string => {
    return normalizeContextValue(primary) ?? normalizeContextValue(secondary) ?? notCapturedInWorkflow;
  };

  const caregiverMainConcern = contextValue(
    reportIntakeContext.caregiverMainConcern,
    sessionIntakeContext.caregiverMainConcern,
  );
  const symptomDuration = contextValue(
    reportIntakeContext.symptomDuration,
    sessionIntakeContext.symptomDuration,
  );
  const fallsFrequency = contextValue(
    reportIntakeContext.fallsFrequency,
    sessionIntakeContext.fallsFrequency,
  );
  const recentTherapyChanges = contextValue(
    reportIntakeContext.recentTherapyChanges,
    sessionIntakeContext.recentTherapyChanges,
  );
  const recentSurgeryInterventionChanges = contextValue(
    reportIntakeContext.recentSurgeryInterventionChanges,
    sessionIntakeContext.recentSurgeryInterventionChanges,
  );
  const assistiveDeviceSupport = contextValue(
    reportIntakeContext.assistiveDeviceSupport,
    sessionIntakeContext.assistiveDeviceSupport,
  );
  const priorDiagnosisOrSpecialistReview = contextValue(
    reportIntakeContext.priorDiagnosisOrSpecialistReview,
    sessionIntakeContext.priorDiagnosisOrSpecialistReview,
  );
  const correctedAge = contextValue(
    reportIntakeContext.correctedAge,
    sessionIntakeContext.correctedAge,
  );
  const intakeContextRows = [
    { label: "Caregiver main concern", value: caregiverMainConcern },
    { label: "First noticed / duration", value: symptomDuration },
    { label: "Falls frequency", value: fallsFrequency },
    { label: "Recent therapy changes", value: recentTherapyChanges },
    {
      label: "Recent surgery/intervention changes",
      value: recentSurgeryInterventionChanges,
    },
    { label: "Assistive device / walking support", value: assistiveDeviceSupport },
    { label: "Prior diagnosis / specialist review", value: priorDiagnosisOrSpecialistReview },
    { label: "Corrected age (if provided)", value: correctedAge },
  ];
  const hasIntakeContext = intakeContextRows.some(
    (entry) => entry.value !== notCapturedInWorkflow,
  );
  const supplementalMotorMetadata = clinicalAssessmentData?.supplementalMetadata;
  const isSupplementalMotorContext =
    supplementalMotorMetadata?.source === "supplemental" &&
    (!supplementalMotorMetadata.linkedResultId || supplementalMotorMetadata.linkedResultId === resultId);
  const supplementalMotorTimestamp =
    supplementalMotorMetadata?.completedAt ?? clinicalAssessmentData?.assessedAt ?? null;
  const hasMotorContextData =
    Boolean(clinicalAssessmentData?.motorDelayAssessment) ||
    (clinicalAssessmentData?.redFlags?.length ?? 0) > 0;

  const packetTimestamp = result.analyzedAt ?? result.run.analyzedAt;
  const clipUsabilityLabel =
    result.quality.result === "pass"
      ? "Usable for interpretation"
      : result.quality.result === "borderline"
        ? "Use with caution"
        : "Low usability - interpret carefully";
  const observedSummary =
    result.concerns.overallLevel === "none"
      ? "No clear concern pattern was detected in this recording."
      : `${formatDomainLabel(result.concerns.overallLevel)} concern pattern observed in this recording.`;
  const evidenceHighlights = concernEvidence
    .filter((entry) => !result.concerns.suppressedDomains.includes(entry.domain))
    .slice(0, 4);
  const assessabilityRows = CONCERN_DOMAINS.map((domain) => {
    const evidence = evidenceByDomain.get(domain.key);
    const isSuppressed = result.concerns.suppressedDomains.includes(domain.key);
    const isAssessed = result.concerns.assessedDomains.includes(domain.key);
    const hasLimitedFrames = Boolean(evidence && evidence.frameCount > 0 && evidence.frameCount < 10);
    const hasLowerConfidence = Boolean(evidence && evidence.confidence > 0 && evidence.confidence < 0.75);

    if (isSuppressed || !isAssessed) {
      return {
        domainLabel: domain.label,
        statusLabel: "Not assessed",
        statusClass: "bg-surface-container text-foreground/90 border-slate-300",
        reason: "Insufficient signal in this recording for a dependable interpretation.",
      };
    }

    if (isBestEffort || hasLimitedFrames || hasLowerConfidence || Boolean(evidence?.missingInfo)) {
      let reason = "Assessment is available, with limited confidence in this recording.";

      if (isBestEffort) {
        reason = "Preliminary best-effort run; confidence is intentionally conservative.";
      } else if (hasLimitedFrames) {
        reason = "Based on a limited number of usable moments in this clip.";
      } else if (hasLowerConfidence) {
        reason = "Signal clarity was moderate, so interpretation is reported with caution.";
      }

      return {
        domainLabel: domain.label,
        statusLabel: "Assessed with caution",
        statusClass: "bg-orange-100 text-orange-900 border-orange-300",
        reason,
      };
    }

    return {
      domainLabel: domain.label,
      statusLabel: "Assessed",
      statusClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      reason: "Clear and consistent signal was available for this domain.",
    };
  });


  const handlePrintPacket = () => {
    window.print();
  };

  const handleCreateSecureShareLink = async () => {
    if (isCreatingShareLink) return;

    if (!result.reports?.caregiver || !result.reports?.clinician || !result.reports?.handoffText) {
      setShareLinkStatus("Secure share link is unavailable for this result. Re-run analysis to generate a full report bundle.");
      return;
    }

    setIsCreatingShareLink(true);
    try {
      const response = await fetch("/api/share/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId: result.id,
          payload: {
            caregiver: result.reports.caregiver,
            clinician: result.reports.clinician,
            handoffText: result.reports.handoffText,
          },
        }),
      });

      const body = (await response.json()) as {
        error?: string;
        shareUrl?: string;
        expiresAt?: string;
      };

      if (!response.ok || !body.shareUrl) {
        throw new Error(body.error ?? "Unable to create secure share link.");
      }

      const expiryText = body.expiresAt
        ? ` Expires ${new Date(body.expiresAt).toLocaleString()}.`
        : "";

      try {
        await navigator.clipboard.writeText(body.shareUrl);
        setShareLinkStatus(`Secure share link created and copied.${expiryText}`);
      } catch {
        window.prompt("Copy this secure share link:", body.shareUrl);
        setShareLinkStatus(`Secure share link created.${expiryText} Clipboard access was unavailable.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create secure share link.";
      setShareLinkStatus(message);
    } finally {
      setIsCreatingShareLink(false);
    }
  };

  const handleCopyLocalSessionLink = async () => {
    const shareUrl = window.location.href;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareLinkStatus("Session link copied to clipboard.");
        return;
      }
    } catch {
      // Fall through to manual copy prompt.
    }

    window.prompt("Copy this local session link:", shareUrl);
    setShareLinkStatus("Clipboard access was unavailable, so the link was shown for manual copy.");
  };

  const handleGenerateAiInsight = async () => {
    if (isGeneratingAiInsight) {
      return;
    }

    setIsGeneratingAiInsight(true);
    setAiInsightError(null);

    try {
      const metricSnapshot = Object.entries(result.features)
        .slice(0, 8)
        .map(([name, metric]) => ({
          name,
          value: metric.suppressed ? null : metric.value,
          confidencePct: metric.suppressed ? 0 : Math.round(metric.confidence * 100),
          limitedReason: metric.limitedReason ?? null,
        }));

      const response = await fetch("/api/navigator/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId: result.id,
          profile: {
            nickname: result.session.nickname,
            ageMonths: result.session.ageMonths,
          },
          concernSummary: {
            overallLevel: result.concerns.overallLevel,
            followupPriority: result.concerns.followupPriority,
            assessedDomains: result.concerns.assessedDomains,
            suppressedDomains: result.concerns.suppressedDomains,
            qualityWarning: result.concerns.qualityWarning,
          },
          qualitySummary: {
            result: result.quality.result,
            confidenceNotes: result.quality.confidenceNotes,
            failureReasons: result.quality.failureReasons,
            borderlineReasons: result.quality.borderlineReasons,
          },
          intakeContext: {
            caregiverMainConcern,
            symptomDuration,
            fallsFrequency,
          },
          metricSnapshot,
        }),
      });

      const body = (await response.json()) as AiInsightResponse & { error?: string };

      if (!response.ok || !body.success) {
        throw new Error(body.error ?? "Unable to generate insight right now.");
      }

      setAiInsight({
        success: true,
        source: body.source,
        insightSummary: body.insightSummary,
        nextSteps: body.nextSteps,
        confidenceQualifier: body.confidenceQualifier,
        disclaimer: body.disclaimer,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate insight right now.";
      setAiInsightError(message);
    } finally {
      setIsGeneratingAiInsight(false);
    }
  };

  const handleSaveFeedbackForParent = async () => {
    const trimmedNote = clinicianNote.trim();
    if (!trimmedNote) {
      setFeedbackSyncStatus({
        tone: "error",
        message: "Add a clinician note before publishing feedback.",
      });
      return;
    }

    if (!result) {
      setFeedbackSyncStatus({
        tone: "error",
        message: "Result record was not found in this session. Reopen the result and try again.",
      });
      return;
    }

    setFeedbackSyncStatus({ tone: "success", message: "Saving..." });

    try {
      const updatedAt = new Date().toISOString();
      const feedbackPayload: ClinicianFeedbackPayload = {
        note: trimmedNote,
        updatedAt,
        visibility: "parent_and_clinician",
        source: "clinician_packet",
      };

      const updated = {
        ...result,
        clinicianFeedback: feedbackPayload,
      };
      
      writeResult(resultId, updated);
      await saveResultToCloud(resultId, updated);
      
      setPublishedFeedbackAt(updatedAt);
      setFeedbackSyncStatus({
        tone: "success",
        message: "Feedback published to this assessment. Parent portal can now display it.",
      });
    } catch {
      setFeedbackSyncStatus({
        tone: "error",
        message: "Could not persist feedback. Check connection and try again.",
      });
    }
  };

  const handleClearPublishedFeedback = async () => {
    if (!result) {
      setFeedbackSyncStatus({
        tone: "error",
        message: "Result record was not found in this session.",
      });
      return;
    }
    
    setFeedbackSyncStatus({ tone: "success", message: "Clearing..." });

    try {
      const updated = { ...result } as Record<string, unknown>;
      delete updated.clinicianFeedback;
      
      writeResult(resultId, updated);
      await saveResultToCloud(resultId, updated);

      setClinicianNote("");
      setPublishedFeedbackAt(null);
      setFeedbackSyncStatus({
        tone: "success",
        message: "Published feedback cleared for this assessment.",
      });
    } catch {
      setFeedbackSyncStatus({
        tone: "error",
        message: "Could not clear feedback. Check connection and try again.",
      });
    }
  };

  return (
    <div className="clinician-packet min-h-dvh bg-surface-container-low/50 pb-12">
      <div className="clinician-packet__content mx-auto max-w-6xl space-y-4 px-4 py-6">

        <div className="space-y-2">
          <div className="print-hidden inline-flex items-center rounded-xl border border-border/60 bg-surface-container-low p-1">
            <button
              type="button"
              onClick={() => router.push(`/results/${resultId}`)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Parent View
            </button>
            <button
              type="button"
              className="rounded-lg bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-foreground shadow-sm"
              aria-current="page"
            >
              Clinician View
            </button>
          </div>

          <h1 className="text-2xl font-bold">Clinical Handoff Packet</h1>
          <p className="text-sm text-muted-foreground">
            Decision-first summary for clinical review. Advanced evidence is collapsed in section 7.
          </p>

          <div className="print-hidden inline-flex w-full max-w-lg items-center rounded-xl border border-border/60 bg-card/60 p-1 backdrop-blur-sm shadow-xs">
            {CLINICIAN_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200 ${
                  activeTab === tab.key
                    ? "bg-card text-primary shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className={activeTab === "snapshot" ? "space-y-6" : "hidden print:block print:space-y-6"}>
          
          {/* Dashboard Row 1: Hero Banner Component */}
          <Card className={`print-section border bg-card/90 backdrop-blur-sm transition-all duration-300 hover:shadow-md ${FOLLOWUP_CALLOUT_STYLES[followUpPriority]} shadow-sm`}>
            <CardContent className="p-0">
              <div className="flex flex-col md:flex-row">
                {/* Left side: Key Clinical Signal */}
                <div className="flex flex-1 flex-col justify-center border-b p-5 md:border-b-0 md:border-r border-border/60 bg-surface-container-low/30">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Overall Diagnostic Signal</p>
                  <div className="mt-2 flex items-center gap-3">
                    <Badge variant="outline" className={`text-xs px-2.5 py-1 uppercase tracking-wider font-bold shadow-xs ${CONCERN_BADGE_STYLES[overallConcernLevel]}`}>
                      {overallConcernLabel}
                    </Badge>
                  </div>
                  <p className="mt-4 text-[14px] font-medium leading-relaxed text-foreground">{observedSummary}</p>
                </div>
                {/* Right side: Action Plan & Context */}
                <div className="flex-1 p-5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 opacity-80" />
                    <div>
                      <p className="font-bold tracking-tight text-foreground">{followUpRecommendation}</p>
                      <p className="mt-1 text-[13px] text-muted-foreground">{FOLLOWUP_CALLOUT_TEXT[followUpPriority]}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-1 rounded-lg bg-surface-container-low/80 p-3 text-xs leading-relaxed text-foreground/90 border border-border/50">
                    <span className="mb-0.5 font-semibold text-foreground">Contextual Summary</span>
                    <p>Case: <span className="font-medium">{result.session.nickname}</span> • View: {result.concerns.viewLabel}</p>
                    <p>Source video: {result.run.sourceClipFilename ?? "Uploaded clip"}</p>
                    {packetTimestamp && <p className="text-muted-foreground">Captured: {new Date(packetTimestamp).toLocaleString()}</p>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* New Grid layout: Findings Left, Scales Right */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            
            {/* Left Col: Core Domain Findings */}
            <div className="md:col-span-7 space-y-4">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground/90">
                  <Stethoscope className="h-4 w-4 text-primary/80" />
                  Primary Domain Findings
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground pt-1">
                  System covered {result.concerns.assessedDomains.length} / {CONCERN_DOMAINS.length} core domains.{' '}
                  {result.quality.confidenceNotes}
                </p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
                {CONCERN_DOMAINS.map((domain) => {
                  const level = toConcernLevel(result.concerns[domain.key]);
                  const isSuppressed = result.concerns.suppressedDomains.includes(domain.key);
                  const evidence = evidenceByDomain.get(domain.key);

                  return (
                    <div key={domain.key} className="relative overflow-hidden rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
                      <p className="text-[13px] font-bold text-foreground/90 uppercase tracking-wide mb-3">{domain.label}</p>
                      <div className="flex flex-col gap-2 items-start">
                        <Badge
                          variant="outline"
                          className={`text-[12px] px-2.5 py-0.5 font-bold shadow-xs ${
                            isSuppressed
                              ? "border-amber-300 bg-amber-50 text-amber-800"
                              : CONCERN_BADGE_STYLES[level]
                          }`}
                        >
                          {isSuppressed ? "Not assessed" : CONCERN_LABELS[level]}
                        </Badge>
                        <p className="text-[13px] text-foreground/90 font-medium leading-relaxed mt-1 line-clamp-3">
                          {evidence?.explanation ?? "No detailed narrative available."}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Technical provenance dropdown */}
              <details className="print-hidden group mt-4">
                <summary className="cursor-pointer text-[12px] font-medium text-muted-foreground/80 hover:text-muted-foreground transition-colors list-none flex items-center gap-1.5 focus:outline-hidden">
                  <span className="text-[10px] group-open:rotate-90 transition-transform">▶</span> Technical provenance
                </summary>
                <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-3">
                  <RunProvenanceBadge run={result.run} />
                  <Badge variant="outline" className="text-[10px] border-border/60 text-muted-foreground/80 bg-muted/10">
                    {result.run.modelLabel}
                  </Badge>
                </div>
              </details>
            </div>

            {/* Right Col: Scales */}
            <div className="md:col-span-5 space-y-4">
              <h3 className="text-sm font-semibold tracking-tight text-foreground/90 pb-1">Clinical Scales</h3>
              
              {false && hasMotorContextData && (
                <Card className="print-section border-amber-300 bg-amber-50/60 shadow-sm">
                  <CardContent className="p-3">
                    <p className="text-xs text-amber-900/90 font-medium">
                      {isSupplementalMotorContext
                        ? "Supplemental Motor Milestone Context"
                        : "Motor Milestone Context"}
                    </p>
                    <p className="mt-1 text-[11px] text-amber-900/80 leading-relaxed">
                      {isSupplementalMotorContext
                        ? "This motor screening was added after gait analysis and should be interpreted as supportive context."
                        : "Motor screening context is available from the concern workflow."}
                    </p>
                    {supplementalMotorTimestamp && (
                      <p className="mt-1.5 text-[10px] text-amber-900/60 uppercase tracking-wide">
                        Captured: {supplementalMotorTimestamp ? new Date(supplementalMotorTimestamp!).toLocaleString() : ""}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* GMFCS */}
              <div className="max-h-[600px] overflow-y-auto pr-1 pb-1 scrollbar-thin scrollbar-thumb-slate-200">
                <GMFCSCard interactive={true} />
              </div>

              {/* GMA Assessment Card */}
              {(() => {
                const ageMonths = result.session.ageMonths ?? 0;
                const gmaApplicable = isGMAApplicableByMonths(ageMonths);

                if (!gmaApplicable) return null;

                if (gmaResult) {
                  return (
                    <div className="space-y-1">
                      <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-violet-800/60 mb-2">
                        Prechtl GMA Panel
                      </p>
                      <GMAAssessmentCard result={gmaResult} showInterpretation={true} />
                    </div>
                  );
                }

                return (
                  <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-4 shadow-[inset_0_2px_4px_rgba(0,0,0,0.01)]">
                    <p className="text-xs font-bold uppercase tracking-wider text-violet-900">
                      Prechtl GMA Candidate
                    </p>
                    <p className="mt-2 text-[11px] leading-relaxed text-violet-800/80">
                      Child is {ageMonths} months old. Assess parent observations via the Parent Portal to populate General Movements Assessment scoring here.
                    </p>
                  </div>
                );
              })()}

              {/* Motor Delay Assessment */}
              {false && clinicalAssessmentData?.motorDelayAssessment && (
                <MotorDelayAssessmentSummary
                  assessment={clinicalAssessmentData!.motorDelayAssessment!}
                  ageMonths={result?.session?.ageMonths ?? 0}
                  childName={result?.session?.nickname ?? "Child"}
                />
              )}
            </div>
          </div>

          {/* Red flags block */}
          {clinicalAssessmentData?.redFlags && clinicalAssessmentData.redFlags.length > 0 && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50/40 p-4 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-red-900">
                <AlertTriangle className="h-4 w-4" />
                {isSupplementalMotorContext
                  ? "Supplemental Caregiver-Reported Red Flags"
                  : "Caregiver-Reported Red Flags"}
              </h3>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-red-900/80">
                {clinicalAssessmentData.redFlags.map((flag, index) => (
                  <li key={index}>{flag}</li>
                ))}
              </ul>
              {clinicalAssessmentData.assessedAt && (
                <p className="mt-3 border-t border-red-200/50 pt-2 text-[10px] uppercase tracking-wide text-red-900/50">
                  Assessed: {new Date(clinicalAssessmentData.assessedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>

        <Card className={`print-section print-hidden border-border/60 bg-card/60 shadow-sm backdrop-blur-sm transition-all duration-300 ${activeTab === "evidence" ? "" : "hidden"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-foreground">
              <Video className="h-4 w-4 text-muted-foreground" />
              8. Appendix / Advanced Evidence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4 rounded-xl border border-border/40 bg-surface-container-low/50 p-4 backdrop-blur-[2px]">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-border/60 bg-card/80 p-5 shadow-[inset_0_1px_4px_rgba(0,0,0,0.01)] backdrop-blur-sm transition-all duration-300 hover:shadow-md">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Why this result appears</p>
                    {evidenceHighlights.length > 0 ? (
                      <ul className="mt-2 space-y-2 text-[13px] text-muted-foreground leading-relaxed">
                        {evidenceHighlights.map((entry) => (
                          <li key={entry.domain}>
                            <span className="font-semibold text-foreground">{formatDomainLabel(entry.domain)}:</span> {entry.explanation}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">No domain-level evidence narrative was generated.</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-border/60 bg-card/80 p-5 shadow-[inset_0_1px_4px_rgba(0,0,0,0.01)] backdrop-blur-sm transition-all duration-300 hover:shadow-md">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Measured movement signals</p>
                    <div className="mt-2 space-y-2.5">
                      {Object.entries(result.features).map(([key, metric]) => (
                        <div
                          key={key}
                          className={`grid grid-cols-[1fr_auto] items-center gap-2 text-[13px] ${metric.suppressed ? "opacity-45" : ""}`}
                        >
                          <div>
                            <p className="font-medium text-foreground/90">{formatDomainLabel(key)}</p>
                            {metric.limitedReason && (
                              <p className="text-[11px] text-slate-400">{metric.limitedReason}</p>
                            )}
                          </div>
                          <p className="font-mono tabular-nums text-foreground">
                            {metric.suppressed ? "-" : `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`}
                            {!metric.suppressed && (
                              <span className="ml-1 text-muted-foreground">({Math.round(metric.confidence * 100)}%)</span>
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {hasTrace && hasVideo && videoUrl ? (
                  <AnnotatedVideoPlayer
                    trace={result.trace!}
                    videoUrl={videoUrl}
                    jumpToFrameIndex={jumpToFrameIndex}
                    audience="clinician"
                    showAdvancedControls={false}
                  />
                ) : hasTrace ? (
                  <p className="text-xs text-muted-foreground">
                    Trace is present, but source video is unavailable in local storage.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Full video evidence requires an analysis trace.
                  </p>
                )}

                {hasTrace && result.trace && (() => {
                  const p = result.trace.pipeline;
                  const cycles = result.trace.gaitCycles;
                  const usablePct = Math.round(p.usableFramePct * 100);
                  const lrRatio = p.leftSteps > 0 && p.rightSteps > 0
                    ? Math.min(p.leftSteps, p.rightSteps) / Math.max(p.leftSteps, p.rightSteps)
                    : null;
                  const avgCycleMs = cycles.length > 0
                    ? Math.round(cycles.reduce((sum, c) => sum + c.durationMs, 0) / cycles.length)
                    : null;
                  const symmetryLabel = lrRatio === null ? "No bilateral steps detected" :
                    lrRatio >= 0.85 ? "Good L/R balance" :
                    lrRatio >= 0.65 ? "Mild L/R imbalance" : "Notable L/R imbalance";
                  const symmetryClass = lrRatio === null ? "text-muted-foreground" :
                    lrRatio >= 0.85 ? "text-emerald-700" :
                    lrRatio >= 0.65 ? "text-amber-700" : "text-red-700";
                  return (
                    <div className="rounded-xl border border-border/60 bg-card/80 p-5 shadow-[inset_0_1px_4px_rgba(0,0,0,0.01)] backdrop-blur-sm transition-all duration-300 hover:shadow-md">
                      <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Gait Cycle Summary — Pipeline Output</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-lg bg-surface-container-low/80 border border-border/50 px-4 py-3 pb-4">
                          <p className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">Detected Steps</p>
                          <p className="text-xl font-bold text-foreground mt-1">{p.detectedSteps}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">L: {p.leftSteps} · R: {p.rightSteps}</p>
                        </div>
                        <div className="rounded-lg bg-surface-container-low/80 border border-border/50 px-4 py-3 pb-4">
                          <p className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">Gait Cycles</p>
                          <p className="text-xl font-bold text-foreground mt-1">{cycles.length}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{avgCycleMs !== null ? `~${avgCycleMs} ms avg` : "—"}</p>
                        </div>
                        <div className="rounded-lg bg-surface-container-low/80 border border-border/50 px-4 py-3 pb-4">
                          <p className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">Usable Frames</p>
                          <p className="text-xl font-bold text-foreground mt-1">{usablePct}%</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{p.usableFrames} / {p.totalFrames} frames</p>
                        </div>
                        <div className="rounded-lg bg-surface-container-low/80 border border-border/50 px-4 py-3 pb-4">
                          <p className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">Walk Direction</p>
                          <p className="text-lg font-bold capitalize text-foreground mt-1">{p.direction}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">from classifier</p>
                        </div>
                      </div>
                      <div className="mt-3.5 flex flex-wrap items-center gap-2">
                        <span className={`text-xs font-semibold ${symmetryClass}`}>{symmetryLabel}</span>
                        {lrRatio !== null && (
                          <span className="text-xs text-slate-400">(ratio: {lrRatio.toFixed(2)})</span>
                        )}
                        {p.lrTrackingStable ? (
                          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 bg-opacity-70 text-[10px] text-emerald-800 p-0.5 px-2">L/R Tracking Stable</Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 bg-opacity-70 text-[10px] text-amber-900 p-0.5 px-2">L/R Tracking Uncertain</Badge>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {hasTrace && (
                  <>
                    <EventTimeline
                      trace={result.trace!}
                      onJumpToFrame={(frameIndex: number) => setJumpToFrameIndex(frameIndex)}
                    />
                    {keyFrames && (
                      <KeyFrameGallery
                        keyFrames={keyFrames}
                        trace={result.trace!}
                        videoUrl={videoUrl}
                        renderMode="auto-thumbnails"
                        onFrameClick={(frameIndex: number) => setJumpToFrameIndex(frameIndex)}
                      />
                    )}
                  </>
                )}

                {hasTrace && <AnalysisTracePanel trace={result.trace!} concernEvidence={concernEvidence} />}
                <HowAnalysisWorksPanel result={result} />
            </div>

            <div className="print-only rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
              <p className="font-semibold uppercase tracking-wide">Appendix note</p>
              <p className="mt-2">
                Advanced evidence panels are interactive in digital view.
                Use digital view for frame-level review.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className={`print-section print-hidden ${activeTab === "handoff" ? "" : "hidden"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">9. Handoff Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Evidence-grounded AI insight
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 text-xs"
                  onClick={handleGenerateAiInsight}
                  disabled={isGeneratingAiInsight}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {isGeneratingAiInsight ? "Generating insight..." : "Generate AI insight"}
                </Button>
              </div>
              {aiInsightError && <p className="mt-2 text-xs text-destructive">{aiInsightError}</p>}
              {aiInsight && (
                <div className="mt-2 space-y-2 rounded-md border bg-background p-2.5 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{aiInsight.insightSummary}</p>
                  <p className="text-[11px] uppercase tracking-wide">
                    Source: {aiInsight.source === "ai" ? "Live AI" : "Deterministic fallback"}
                  </p>
                  {aiInsight.nextSteps.length > 0 && (
                    <ul className="list-disc space-y-1 pl-4">
                      {aiInsight.nextSteps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  )}
                  <p>{aiInsight.confidenceQualifier}</p>
                  <p className="text-[11px]">{aiInsight.disclaimer}</p>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Use these controls to complete sharing and documentation.
            </p>

            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Primary packet actions
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Button className="gap-2 text-xs" onClick={handlePrintPacket}>
                  <Printer className="h-3.5 w-3.5" />
                  Print packet
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 text-xs"
                  onClick={handleCreateSecureShareLink}
                  disabled={isCreatingShareLink}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {isCreatingShareLink ? "Creating secure link..." : "Create secure share link"}
                </Button>
                <Button variant="outline" className="gap-2 text-xs" disabled>
                  <FileText className="h-3.5 w-3.5" />
                  Direct PDF export unavailable
                </Button>
                <Button variant="outline" className="gap-2 text-xs" onClick={handleCopyLocalSessionLink}>
                  <Copy className="h-3.5 w-3.5" />
                  Copy local session link
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Direct PDF export is unavailable in this local session. Use Print packet, then choose
                Save as PDF in your browser print dialog.
              </p>
              <p className="text-xs text-muted-foreground">
                Links and notes remain in this browser session until server-backed packet storage is added.
              </p>
              {shareLinkStatus && <p className="mt-1 text-xs text-primary">{shareLinkStatus}</p>}
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Optional media attachment
              </p>
              {exportAvailable && result.run.exportArtifactPath ? (
                <a href={result.run.exportArtifactPath} download className="mt-2 inline-flex w-full sm:w-auto">
                  <Button variant="outline" className="w-full gap-2 text-xs sm:w-auto">
                    <Download className="h-3.5 w-3.5" />
                    Download annotated MP4 (secondary)
                  </Button>
                </a>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Annotated MP4 export is unavailable for this run.
                </p>
              )}
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Secondary navigation
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Button
                  variant="outline"
                  className="gap-2 text-xs"
                  onClick={() => router.push(`/results/${resultId}`)}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to parent summary
                </Button>
                <Button
                  className="gap-2 text-xs"
                  onClick={() => router.push("/capture")}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Analyze another clip
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`print-section ${activeTab === "handoff" ? "" : "hidden print:block"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">10. Clinician Feedback for Parent Portal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground print-hidden">
              Save this note to the assessment record to make it visible in the parent portal on this device/session.
            </p>
            <Textarea
              className="print-hidden min-h-28"
              placeholder="Add appointment note, follow-up intent, or context for the care team..."
              value={clinicianNote}
              onChange={(event) => setClinicianNote(event.target.value)}
            />
            <div className="print-hidden flex flex-wrap gap-2">
              <Button size="sm" className="gap-2" onClick={handleSaveFeedbackForParent}>
                Publish feedback to parent portal
              </Button>
              <Button size="sm" variant="outline" className="gap-2" onClick={handleClearPublishedFeedback}>
                Clear published feedback
              </Button>
            </div>
            {publishedFeedbackAt && (
              <p className="print-hidden text-[11px] text-muted-foreground">
                Last published: {new Date(publishedFeedbackAt).toLocaleString()}
              </p>
            )}
            {feedbackSyncStatus && (
              <p
                className={`print-hidden text-xs ${
                  feedbackSyncStatus.tone === "success" ? "text-emerald-700" : "text-destructive"
                }`}
              >
                {feedbackSyncStatus.message}
              </p>
            )}
            <div className="print-only rounded-lg border bg-muted/20 p-3 text-xs leading-relaxed">
              <p className="font-semibold uppercase tracking-wide">Clinician note</p>
              <p className="mt-2 whitespace-pre-wrap text-foreground">
                {clinicianNote.trim().length > 0 ? clinicianNote : "No clinician note entered."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
