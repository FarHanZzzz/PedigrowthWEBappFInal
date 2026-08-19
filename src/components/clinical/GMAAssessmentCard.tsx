"use client";

// PEDI-GROWTH — GMA Assessment Card (Clinician Handoff)
// ======================================================
// Displays the GMA screening summary on the clinician results page.
// Shows phase, risk flag, parent-reported signs, clinician classification
// slot, interpretation guidance, and citation reference.
//
// Based on: Prechtl GMA protocol (1997); Gao et al. (2023) PMC10721621.

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type FidgetyClassification,
  type GMAScreeningResult,
  type GMARiskFlag,
  type WrithingClassification,
  FIDGETY_CLASSIFICATION_DESCRIPTIONS,
  FIDGETY_CLASSIFICATION_LABELS,
  GMA_RISK_BADGE_STYLES,
  GMA_RISK_LABELS,
  WRITHING_CLASSIFICATION_DESCRIPTIONS,
  WRITHING_CLASSIFICATION_LABELS,
} from "@/lib/clinical/frameworks";

// ── Props ──────────────────────────────────────────────────

interface GMAAssessmentCardProps {
  result: GMAScreeningResult;
  /** If true, shows the full interpretation panel (clinician only) */
  showInterpretation?: boolean;
}

// ── Icon map ───────────────────────────────────────────────

const RISK_ICON: Record<GMARiskFlag, React.ReactNode> = {
  none: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
  watch: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  urgent: <XCircle className="h-5 w-5 text-red-600" />,
};

const RISK_HEADER_STYLE: Record<GMARiskFlag, string> = {
  none: "border-emerald-200 bg-emerald-50/40",
  watch: "border-amber-200 bg-amber-50/40",
  urgent: "border-red-200 bg-red-50/40",
};

// ── Phase labels ───────────────────────────────────────────

const PHASE_LABEL: Record<string, string> = {
  writhing: "Writhing Movement Phase",
  fidgety: "Fidgety Movement Phase",
  not_applicable: "Not Applicable",
};

const PHASE_AGE_RANGE: Record<string, string> = {
  writhing: "Birth – 9 weeks corrected",
  fidgety: "9 – 20 weeks corrected",
  not_applicable: "",
};

// ── Main Component ─────────────────────────────────────────

export default function GMAAssessmentCard({
  result,
  showInterpretation = true,
}: GMAAssessmentCardProps) {
  if (result.phase === "not_applicable") {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            <p>
              <span className="font-medium text-foreground">
                GMA not applicable
              </span>{" "}
              — General Movements Assessment applies to infants 0–20 weeks
              corrected age. This child ({result.correctedAgeWeeks}w corrected)
              is in the intentional motor phase; gait analysis is the
              appropriate assessment tool.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasClinicianClassification = result.clinicianClassification !== null;

  return (
    <Card className={`border ${RISK_HEADER_STYLE[result.riskFlag]}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Prechtl General Movements Assessment
            </p>
            <CardTitle className="mt-0.5 text-base">
              {PHASE_LABEL[result.phase]}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {PHASE_AGE_RANGE[result.phase]} ·{" "}
              {result.correctedAgeWeeks}w corrected age
            </p>
          </div>
          <Badge
            variant="outline"
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold ${GMA_RISK_BADGE_STYLES[result.riskFlag]}`}
          >
            {RISK_ICON[result.riskFlag]}
            {GMA_RISK_LABELS[result.riskFlag]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pb-4">
        {/* ── Summary note ──────────────────────────────── */}
        <p className="text-sm leading-relaxed text-foreground">
          {result.summaryNote}
        </p>

        {/* ── Observation metrics ───────────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          <MetricChip
            label="Normal signs"
            value={result.observedNormalSignCount}
            colorClass="text-emerald-700"
          />
          <MetricChip
            label="Concern signs"
            value={result.observedConcernSignCount}
            colorClass={
              result.observedConcernSignCount > 0
                ? "text-amber-700"
                : "text-muted-foreground"
            }
          />
          <MetricChip
            label="Conditions met"
            value={result.observationConditionsMet ? "Yes" : "No"}
            colorClass={
              result.observationConditionsMet
                ? "text-emerald-700"
                : "text-amber-700"
            }
          />
        </div>

        {/* ── Recording condition warning ───────────────── */}
        {!result.observationConditionsMet && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Parent did not confirm standard recording conditions were met.
              Results should be interpreted with caution — movement pattern
              disruption (crying, stimulation) may affect observed signs.
            </p>
          </div>
        )}

        {/* ── Clinician classification block ────────────── */}
        {hasClinicianClassification && result.phase === "writhing" && (
          <ClassificationBlock
            title="Clinician Classification (Writhing)"
            label={
              WRITHING_CLASSIFICATION_LABELS[
                result.clinicianClassification as WrithingClassification
              ]
            }
            description={
              WRITHING_CLASSIFICATION_DESCRIPTIONS[
                result.clinicianClassification as WrithingClassification
              ]
            }
            riskFlag={result.riskFlag}
          />
        )}
        {hasClinicianClassification && result.phase === "fidgety" && (
          <ClassificationBlock
            title="Clinician Classification (Fidgety)"
            label={
              FIDGETY_CLASSIFICATION_LABELS[
                result.clinicianClassification as FidgetyClassification
              ]
            }
            description={
              FIDGETY_CLASSIFICATION_DESCRIPTIONS[
                result.clinicianClassification as FidgetyClassification
              ]
            }
            riskFlag={result.riskFlag}
          />
        )}

        {/* ── Interpretation guidance ───────────────────── */}
        {showInterpretation && (
          <InterpretationPanel phase={result.phase} riskFlag={result.riskFlag} />
        )}

        {/* ── Urgent referral callout ───────────────────── */}
        {result.riskFlag === "urgent" && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-900">
              Specialist Referral Recommended
            </p>
            <p className="mt-1 text-xs text-red-800">
              The pattern of findings warrants prompt review by a
              developmental paediatrician or neonatologist. A GMA-certified
              assessor should perform a formal assessment. Early intervention
              referral may also be appropriate.
            </p>
          </div>
        )}

        {/* ── Clinical disclaimer ───────────────────────── */}
        <div className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{result.clinicalDisclaimer}</p>
        </div>

        {/* ── Evidence citation ─────────────────────────── */}
        <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground/70">
          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
          <p>{result.referenceNote}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sub-components ─────────────────────────────────────────

function MetricChip({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string | number;
  colorClass: string;
}) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`text-lg font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

function ClassificationBlock({
  title,
  label,
  description,
  riskFlag,
}: {
  title: string;
  label: string;
  description: string;
  riskFlag: GMARiskFlag;
}) {
  const borderClass =
    riskFlag === "urgent"
      ? "border-red-200 bg-red-50/40"
      : riskFlag === "watch"
        ? "border-amber-200 bg-amber-50/40"
        : "border-emerald-200 bg-emerald-50/40";

  return (
    <div className={`rounded-lg border p-3 ${borderClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="mt-1 font-semibold">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

// ── Interpretation Panels ──────────────────────────────────

const WRITHING_INTERPRETATION = {
  none: [
    "Normal writhing movements show variability in amplitude, speed, and direction.",
    "Movement involves the whole body — head, trunk, arms, and legs participate.",
    "Fluent, complex, and varied patterns are characteristic of healthy neural development.",
    "Continue routine monitoring at well-child visits.",
  ],
  watch: [
    "Poor Repertoire (PR) writhing is the most common abnormal pattern.",
    "Movements are monotonous and lack the expected variability and complexity.",
    "PR is a milder risk signal than CS but warrants serial monitoring.",
    "Consider referral to a GMA-certified assessor for formal assessment.",
    "Follow-up observation at next corrected age milestone is recommended.",
  ],
  urgent: [
    "Cramped-Synchronized (CS) writhing is the strongest predictor of spastic cerebral palsy.",
    "Chaotic (Ch) movements — abrupt, large, tremulous — are also a significant risk signal.",
    "Either finding warrants urgent referral to a developmental paediatrician.",
    "Early intervention (physiotherapy, occupational therapy) should be considered immediately.",
    "MRI and neurological work-up may be appropriate at this stage.",
  ],
};

const FIDGETY_INTERPRETATION = {
  none: [
    "Fidgety Movements Present (F+) is the strongest predictor of normal motor outcome at this age.",
    "Gao et al. (2023) automated GMA validation: AUC 0.967 with optimal FMfreq threshold of 0.250.",
    "Continue routine monitoring — no further neurodevelopmental concern from GMA at this stage.",
  ],
  watch: [
    "Abnormal Fidgety Movements (AF) involve exaggerated amplitude, speed, or jerkiness.",
    "AF is rare and may warrant further clinical evaluation.",
    "Consider referral to a GMA-certified assessor for formal MOS-R scoring.",
    "Monitor at next corrected age visit.",
  ],
  urgent: [
    "Fidgety Movements Absent (F−) is the primary risk signal for cerebral palsy in this age window.",
    "In the Gao et al. (2023) validated model: sensitivity 92.5%, specificity 93.6%, AUC 0.967.",
    "Clinical urgency: prompt referral to a developmental paediatrician is recommended.",
    "Early intervention referral (physiotherapy) should be initiated in parallel.",
    "MRI at term-equivalent age (if not yet performed) is appropriate.",
    "Family should be counselled and supported — early intervention significantly improves outcomes for at-risk infants.",
  ],
};

function InterpretationPanel({
  phase,
  riskFlag,
}: {
  phase: string;
  riskFlag: GMARiskFlag;
}) {
  const points =
    phase === "writhing"
      ? WRITHING_INTERPRETATION[riskFlag]
      : FIDGETY_INTERPRETATION[riskFlag];

  const title =
    phase === "writhing"
      ? "Writhing Phase — Clinical Interpretation"
      : "Fidgety Phase — Clinical Interpretation";

  const borderClass =
    riskFlag === "urgent"
      ? "border-red-100"
      : riskFlag === "watch"
        ? "border-amber-100"
        : "border-emerald-100";

  return (
    <div className={`rounded-lg border bg-background p-3 ${borderClass}`}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1.5">
        {points.map((point, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}
