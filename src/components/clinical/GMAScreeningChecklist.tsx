"use client";

// PEDI-GROWTH — GMA Screening Checklist (Parent View)
// ====================================================
// Based on Prechtl General Movements Assessment (GMA) protocol.
// Source: Gao et al., Nature Communications 2023 (PMC10721621)
//
// Age-gated component — only renders for infants 0–20 weeks
// corrected age (writhing phase: 0–8w, fidgety phase: 9–20w).
//
// This is a STRUCTURED OBSERVATION CHECKLIST for parents.
// It is NOT a substitute for a GMA-certified clinical assessment.

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Info,
  Video,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type FidgetyClassification,
  type GMAObservationSign,
  type GMAScreeningResult,
  type GMARiskFlag,
  type WrithingClassification,
  GMA_FIDGETY_SIGNS,
  GMA_RECORDING_PROTOCOL,
  GMA_RISK_BADGE_STYLES,
  GMA_RISK_LABELS,
  GMA_WRITHING_SIGNS,
  computeGMAScreeningResult,
  getGMAPhase,
  isGMAApplicable,
} from "@/lib/clinical/frameworks";

// ── Props ──────────────────────────────────────────────────

interface GMAScreeningChecklistProps {
  /** Corrected (post-menstrual) age in weeks */
  correctedAgeWeeks: number;
  /** Called when the parent submits the checklist */
  onComplete?: (result: GMAScreeningResult) => void;
  /** If provided, renders in read-only mode (e.g. on clinician page) */
  existingResult?: GMAScreeningResult | null;
  /** Whether this is being shown in clinician view (allows classification select) */
  clinicianView?: boolean;
}

// ── Risk visual config ─────────────────────────────────────

const RISK_ICON: Record<GMARiskFlag, React.ReactNode> = {
  none: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  watch: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  urgent: <XCircle className="h-4 w-4 text-red-600" />,
};

// ── Phase display config ───────────────────────────────────

const PHASE_CONFIG = {
  writhing: {
    label: "Writhing Movement Phase",
    ageRange: "Birth – 9 weeks corrected",
    description:
      "During the writhing phase, healthy infants make continuous, slow-to-moderate speed movements involving the whole body. The key qualities are fluency, variability, and complexity.",
    color: "bg-violet-50 border-violet-200 text-violet-800",
    headerColor: "from-violet-600 to-indigo-600",
  },
  fidgety: {
    label: "Fidgety Movement Phase",
    ageRange: "9 – 20 weeks corrected",
    description:
      "During the fidgety phase, healthy infants make small, continuous, oscillating movements of the neck, trunk, and limbs in all directions. These 'fidgety movements' (FMs) are a critical marker of healthy neurological development.",
    color: "bg-sky-50 border-sky-200 text-sky-800",
    headerColor: "from-sky-600 to-cyan-600",
  },
  not_applicable: {
    label: "Not Applicable",
    ageRange: "",
    description: "",
    color: "bg-muted border-muted",
    headerColor: "from-slate-500 to-slate-600",
  },
} as const;

// ── Main Component ─────────────────────────────────────────

export default function GMAScreeningChecklist({
  correctedAgeWeeks,
  onComplete,
  existingResult,
  clinicianView = false,
}: GMAScreeningChecklistProps) {
  const phase = getGMAPhase(correctedAgeWeeks);
  const applicable = isGMAApplicable(correctedAgeWeeks);

  const signs: GMAObservationSign[] =
    phase === "writhing"
      ? GMA_WRITHING_SIGNS
      : phase === "fidgety"
        ? GMA_FIDGETY_SIGNS
        : [];

  const normalSigns = signs.filter((s) => s.presentIndicates === "normal");
  const concernSigns = signs.filter((s) => s.presentIndicates === "concern");

  // Local state
  const [observedIds, setObservedIds] = useState<Set<string>>(
    existingResult
      ? new Set<string>() // can't recover from result, show read-only
      : new Set<string>(),
  );
  const [conditionsMet, setConditionsMet] = useState<boolean>(
    existingResult?.observationConditionsMet ?? false,
  );
  const [showProtocol, setShowProtocol] = useState(false);
  const [submitted, setSubmitted] = useState<GMAScreeningResult | null>(
    existingResult ?? null,
  );
  const [clinicianClass, setClinicianClass] = useState<
    WrithingClassification | FidgetyClassification | null
  >(existingResult?.clinicianClassification ?? null);

  const toggleSign = (id: string) => {
    if (submitted && !clinicianView) return; // read-only after submit
    setObservedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = () => {
    const result = computeGMAScreeningResult({
      correctedAgeWeeks,
      observedSignIds: observedIds,
      clinicianClassification: clinicianClass,
      observationConditionsMet: conditionsMet,
    });
    setSubmitted(result);
    onComplete?.(result);
  };

  // ── Not applicable gate ───────────────────────────────────
  if (!applicable) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">GMA not applicable</span> — General
            Movements Assessment applies to infants 0–20 weeks corrected age.
            This child&apos;s corrected age ({correctedAgeWeeks}w) is outside
            that window. Gait assessment is the appropriate tool for this age.
          </p>
        </CardContent>
      </Card>
    );
  }

  const phaseConf = PHASE_CONFIG[phase];
  const displayResult = submitted;

  return (
    <div className="space-y-4">
      {/* ── Phase header ──────────────────────────────────── */}
      <div
        className={`rounded-xl border p-4 ${phaseConf.color}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
              Prechtl GMA · {phaseConf.ageRange}
            </p>
            <h3 className="mt-0.5 text-base font-bold">{phaseConf.label}</h3>
          </div>
          <Badge variant="outline" className="text-[11px]">
            {correctedAgeWeeks}w corrected age
          </Badge>
        </div>
        <p className="mt-2 text-sm leading-relaxed opacity-80">
          {phaseConf.description}
        </p>
      </div>

      {/* ── Result summary (if submitted) ─────────────────── */}
      {displayResult && (
        <div
          className={`rounded-lg border p-4 ${GMA_RISK_BADGE_STYLES[displayResult.riskFlag]}`}
        >
          <div className="flex items-start gap-2">
            {RISK_ICON[displayResult.riskFlag]}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {GMA_RISK_LABELS[displayResult.riskFlag]}
              </p>
              <p className="mt-1 text-xs leading-relaxed">
                {displayResult.summaryNote}
              </p>
              <p className="mt-2 flex flex-wrap gap-3 text-[11px] opacity-70">
                <span>
                  ✓ Normal signs observed: {displayResult.observedNormalSignCount}
                </span>
                <span>
                  ⚠ Concern signs observed: {displayResult.observedConcernSignCount}
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Recording protocol accordion ──────────────────── */}
      <div className="rounded-lg border bg-background">
        <button
          type="button"
          onClick={() => setShowProtocol((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          aria-expanded={showProtocol}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Video className="h-4 w-4 text-muted-foreground" />
            Recording Protocol — follow before completing checklist
          </div>
          {showProtocol ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {showProtocol && (
          <div className="border-t px-4 pb-4 pt-3">
            <ol className="space-y-1.5 text-sm">
              {GMA_RECORDING_PROTOCOL.steps.map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-3 space-y-1.5">
              {GMA_RECORDING_PROTOCOL.warnings.map((warning, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Recording conditions confirmation ─────────────── */}
      {!submitted && (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background px-4 py-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-muted-foreground accent-primary"
            checked={conditionsMet}
            onChange={(e) => setConditionsMet(e.target.checked)}
          />
          <span className="text-sm text-muted-foreground">
            I confirm: my baby was{" "}
            <span className="font-medium text-foreground">
              calm, awake, and lying on their back
            </span>{" "}
            during the observation. No toys or distractions were used.
          </span>
        </label>
      )}

      {/* ── Normal signs checklist ────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Normal Movement Indicators
            <span className="ml-auto text-[11px] font-normal text-muted-foreground">
              Check all that you observed
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-4">
          {normalSigns.map((sign) => {
            const checked = observedIds.has(sign.id);
            return (
              <SignRow
                key={sign.id}
                sign={sign}
                checked={checked}
                readOnly={!!submitted && !clinicianView}
                onToggle={() => toggleSign(sign.id)}
                variant="normal"
              />
            );
          })}
        </CardContent>
      </Card>

      {/* ── Concern signs checklist ───────────────────────── */}
      <Card className="border-amber-200">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Concern Indicators
            <span className="ml-auto text-[11px] font-normal text-muted-foreground">
              Check any that you observed
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-4">
          {concernSigns.map((sign) => {
            const checked = observedIds.has(sign.id);
            return (
              <SignRow
                key={sign.id}
                sign={sign}
                checked={checked}
                readOnly={!!submitted && !clinicianView}
                onToggle={() => toggleSign(sign.id)}
                variant="concern"
              />
            );
          })}
        </CardContent>
      </Card>

      {/* ── Clinician classification (clinician view only) ── */}
      {clinicianView && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm text-blue-900">
              <ClipboardList className="h-4 w-4" />
              Clinician Classification
              <span className="ml-auto text-[11px] font-normal text-blue-700">
                Complete only if GMA-certified
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {phase === "writhing" ? (
              <WrithingClassificationSelect
                value={clinicianClass as WrithingClassification | null}
                onChange={(v) => setClinicianClass(v)}
              />
            ) : (
              <FidgetyClassificationSelect
                value={clinicianClass as FidgetyClassification | null}
                onChange={(v) => setClinicianClass(v)}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Submit / Reset ────────────────────────────────── */}
      {!submitted ? (
        <Button
          type="button"
          onClick={handleSubmit}
          className="w-full"
          disabled={!conditionsMet && signs.length > 0}
        >
          Submit Observations
        </Button>
      ) : (
        !clinicianView && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSubmitted(null);
              setObservedIds(new Set());
            }}
            className="w-full text-xs"
          >
            Reset and re-observe
          </Button>
        )
      )}

      {/* ── Clinical disclaimer ───────────────────────────── */}
      <div className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          {submitted?.clinicalDisclaimer ??
            "This checklist structures observations for your clinician. Only a General Movements Trust-certified assessor can perform a formal GMA. This tool is a screening support aid, not a diagnostic substitute."}
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

interface SignRowProps {
  sign: GMAObservationSign;
  checked: boolean;
  readOnly: boolean;
  onToggle: () => void;
  variant: "normal" | "concern";
}

function SignRow({ sign, checked, readOnly, onToggle, variant }: SignRowProps) {
  const [showTip, setShowTip] = useState(false);

  const borderClass =
    checked
      ? variant === "normal"
        ? "border-emerald-300 bg-emerald-50/60"
        : "border-amber-300 bg-amber-50/60"
      : "border-border bg-background";

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${borderClass} ${readOnly ? "cursor-default" : "cursor-pointer"}`}
      onClick={readOnly ? undefined : onToggle}
      role={readOnly ? undefined : "checkbox"}
      aria-checked={checked}
      tabIndex={readOnly ? undefined : 0}
      onKeyDown={
        readOnly
          ? undefined
          : (e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                onToggle();
              }
            }
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
            checked
              ? variant === "normal"
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-amber-500 bg-amber-500 text-white"
              : "border-muted-foreground"
          }`}
        >
          {checked && (
            <svg
              className="h-2.5 w-2.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug">{sign.label}</p>
          {sign.riskWeight === 3 && sign.presentIndicates === "concern" && (
            <span className="mt-0.5 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
              Primary risk signal
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowTip((v) => !v);
          }}
          className="ml-1 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Show observation tip"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>
      {showTip && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          💡 {sign.observationTip}
        </p>
      )}
    </div>
  );
}

interface WrithingClassificationSelectProps {
  value: WrithingClassification | null;
  onChange: (v: WrithingClassification | null) => void;
}

const WRITHING_OPTIONS: Array<{
  value: WrithingClassification;
  label: string;
  riskClass: string;
}> = [
  { value: "normal", label: "Normal Writhing", riskClass: "text-emerald-700" },
  {
    value: "poor_repertoire",
    label: "Poor Repertoire (PR)",
    riskClass: "text-amber-700",
  },
  {
    value: "cramped_synchronized",
    label: "Cramped-Synchronized (CS)",
    riskClass: "text-red-700",
  },
  { value: "chaotic", label: "Chaotic (Ch)", riskClass: "text-red-700" },
];

function WrithingClassificationSelect({
  value,
  onChange,
}: WrithingClassificationSelectProps) {
  return (
    <div className="space-y-2">
      {WRITHING_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/30"
        >
          <input
            type="radio"
            name="writhing-class"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-primary"
          />
          <span className={`font-medium ${opt.riskClass}`}>{opt.label}</span>
        </label>
      ))}
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-[11px] text-muted-foreground underline"
        >
          Clear classification
        </button>
      )}
    </div>
  );
}

interface FidgetyClassificationSelectProps {
  value: FidgetyClassification | null;
  onChange: (v: FidgetyClassification | null) => void;
}

const FIDGETY_OPTIONS: Array<{
  value: FidgetyClassification;
  label: string;
  riskClass: string;
}> = [
  {
    value: "present",
    label: "Fidgety Movements Present (F+)",
    riskClass: "text-emerald-700",
  },
  {
    value: "absent",
    label: "Fidgety Movements Absent (F\u2212)",
    riskClass: "text-red-700",
  },
  {
    value: "abnormal",
    label: "Abnormal Fidgety Movements (AF)",
    riskClass: "text-amber-700",
  },
];

function FidgetyClassificationSelect({
  value,
  onChange,
}: FidgetyClassificationSelectProps) {
  return (
    <div className="space-y-2">
      {FIDGETY_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/30"
        >
          <input
            type="radio"
            name="fidgety-class"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-primary"
          />
          <span className={`font-medium ${opt.riskClass}`}>{opt.label}</span>
        </label>
      ))}
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-[11px] text-muted-foreground underline"
        >
          Clear classification
        </button>
      )}
    </div>
  );
}
