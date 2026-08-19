"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileSearch,
  FileClock,
  RefreshCw,
  Stethoscope,
  UserCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { collectResultIds, readResultRaw, readSession, writeSession } from "@/lib/session/sessionStorage";
import { fetchRecentResultsFromCloud, type CloudResultRecord } from "@/lib/db/cloudStorage";
import {
  CONCERN_LABELS,
  FOLLOWUP_BADGE_STYLES,
  RUN_TONE_BADGE_STYLES,
  toConcernLevel,
} from "@/lib/presentation/severity";
import GMAScreeningChecklist from "@/components/clinical/GMAScreeningChecklist";
import {
  type GMAScreeningResult,
  isGMAApplicableByMonths,
} from "@/lib/clinical/frameworks";

interface ParsedResult {
  run?: { classification?: string; analyzedAt?: string };
  assessmentMode?: string;
  quality?: { result?: string; confidenceNotes?: string };
  concerns?: { overallLevel?: string; followupPriority?: string };
  reports?: { caregiver?: { observationsText?: string; monitoringGuidance?: string } };
  clinicianFeedback?: { note?: string; updatedAt?: string; visibility?: string };
  session?: { nickname?: string; ageMonths?: number };
  analyzedAt?: string;
}

type RowStatus = "stable" | "follow_up" | "retake";

function deriveStatus(r: ParsedResult): RowStatus {
  if (r?.run?.classification === "validation_failure") return "retake";
  if (r?.assessmentMode === "cannot_assess" || r?.quality?.result === "fail") return "retake";
  const lvl = String(r?.concerns?.overallLevel ?? "none");
  if (lvl === "moderate" || lvl === "significant") return "follow_up";
  return "stable";
}

function statusMeta(status: RowStatus) {
  if (status === "stable") return { label: "Stable", cls: FOLLOWUP_BADGE_STYLES.routine, Icon: CheckCircle2 };
  if (status === "follow_up") return { label: "Follow-Up", cls: FOLLOWUP_BADGE_STYLES.earlier_review, Icon: AlertTriangle };
  return { label: "Retake", cls: RUN_TONE_BADGE_STYLES.destructive, Icon: RefreshCw };
}

interface Row {
  id: string;
  childName: string;
  ageMonths: number | null;
  analyzedAt: string | null;
  concernLabel: string;
  summary: string | null;
  nextStep: string | null;
  qualityResult: string;
  status: RowStatus;
  followupPriority: string;
  clinicianFeedbackNote: string | null;
  clinicianFeedbackUpdatedAt: string | null;
}

function buildRowsFromSessionStorage(): Row[] {
  if (typeof window === "undefined") return [];
  const ids = collectResultIds(window.sessionStorage);
  const rows: Row[] = [];
  for (const id of ids) {
    const raw = readResultRaw(id);
    if (!raw) continue;
    try {
      const r = JSON.parse(raw) as ParsedResult;
      rows.push({
        id,
        childName: String(r?.session?.nickname ?? "Child"),
        ageMonths: typeof r?.session?.ageMonths === "number" ? r.session.ageMonths : null,
        analyzedAt: r?.analyzedAt ?? r?.run?.analyzedAt ?? null,
        concernLabel: CONCERN_LABELS[toConcernLevel(String(r?.concerns?.overallLevel ?? "none"))],
        summary: r?.reports?.caregiver?.observationsText ?? null,
        nextStep: r?.reports?.caregiver?.monitoringGuidance ?? null,
        qualityResult: String(r?.quality?.result ?? "unknown"),
        status: deriveStatus(r),
        followupPriority: String(r?.concerns?.followupPriority ?? "routine"),
        clinicianFeedbackNote:
          typeof r?.clinicianFeedback?.note === "string" && r.clinicianFeedback.note.trim().length > 0
            ? r.clinicianFeedback.note.trim()
            : null,
        clinicianFeedbackUpdatedAt:
          typeof r?.clinicianFeedback?.updatedAt === "string" ? r.clinicianFeedback.updatedAt : null,
      });
    } catch { /* skip malformed */ }
  }
  return rows.sort((a, b) => {
    const at = a.analyzedAt ? Date.parse(a.analyzedAt) : 0;
    const bt = b.analyzedAt ? Date.parse(b.analyzedAt) : 0;
    return bt - at;
  });
}

function buildRowsFromCloudRecords(records: CloudResultRecord[]): Row[] {
  const rows: Row[] = [];

  for (const record of records) {
    const payload = (record.payload ?? null) as ParsedResult | null;
    if (!payload || typeof payload !== "object") {
      continue;
    }

    rows.push({
      id: record.id,
      childName: String(payload?.session?.nickname ?? "Child"),
      ageMonths: typeof payload?.session?.ageMonths === "number" ? payload.session.ageMonths : null,
      analyzedAt:
        payload?.analyzedAt ??
        payload?.run?.analyzedAt ??
        record.updated_at ??
        record.created_at ??
        null,
      concernLabel: CONCERN_LABELS[toConcernLevel(String(payload?.concerns?.overallLevel ?? "none"))],
      summary: payload?.reports?.caregiver?.observationsText ?? null,
      nextStep: payload?.reports?.caregiver?.monitoringGuidance ?? null,
      qualityResult: String(payload?.quality?.result ?? "unknown"),
      status: deriveStatus(payload),
      followupPriority: String(payload?.concerns?.followupPriority ?? "routine"),
      clinicianFeedbackNote:
        typeof payload?.clinicianFeedback?.note === "string" && payload.clinicianFeedback.note.trim().length > 0
          ? payload.clinicianFeedback.note.trim()
          : null,
      clinicianFeedbackUpdatedAt:
        typeof payload?.clinicianFeedback?.updatedAt === "string" ? payload.clinicianFeedback.updatedAt : null,
    });
  }

  return rows.sort((a, b) => {
    const at = a.analyzedAt ? Date.parse(a.analyzedAt) : 0;
    const bt = b.analyzedAt ? Date.parse(b.analyzedAt) : 0;
    return bt - at;
  });
}

export default function ParentPortalPage() {
  const [localRows, setLocalRows] = useState<Row[]>([]);
  const [cloudRows, setCloudRows] = useState<Row[]>([]);

  useEffect(() => {
    let active = true;

    const hydrateLocal = () => {
      if (!active) return;
      setLocalRows(buildRowsFromSessionStorage());
    };

    hydrateLocal();
    const localInterval = window.setInterval(hydrateLocal, 8000);

    return () => {
      active = false;
      window.clearInterval(localInterval);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const hydrateCloud = () => {
      fetchRecentResultsFromCloud(200)
        .then((records) => {
          if (!active) return;
          setCloudRows(buildRowsFromCloudRecords(records));
        })
        .catch(() => {
          if (!active) return;
          setCloudRows([]);
        });
    };

    hydrateCloud();
    const cloudInterval = window.setInterval(hydrateCloud, 15000);

    return () => {
      active = false;
      window.clearInterval(cloudInterval);
    };
  }, []);

  const rows = useMemo(() => {
    const byId = new Map<string, Row>();

    for (const row of cloudRows) {
      byId.set(row.id, row);
    }

    for (const row of localRows) {
      const existing = byId.get(row.id);
      if (!existing) {
        byId.set(row.id, row);
        continue;
      }

      const existingTs = existing.analyzedAt ? Date.parse(existing.analyzedAt) : 0;
      const rowTs = row.analyzedAt ? Date.parse(row.analyzedAt) : 0;
      if (rowTs > existingTs) {
        byId.set(row.id, row);
      }
    }

    return Array.from(byId.values()).sort((a, b) => {
      const at = a.analyzedAt ? Date.parse(a.analyzedAt) : 0;
      const bt = b.analyzedAt ? Date.parse(b.analyzedAt) : 0;
      return bt - at;
    });
  }, [cloudRows, localRows]);

  // GMA state — local completion tracking
  const [gmaSubmitted, setGmaSubmitted] = useState<GMAScreeningResult | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const session = readSession<{ gmaScreeningResult?: GMAScreeningResult }>();
      return session?.gmaScreeningResult ?? null;
    } catch { return null; }
  });

  // Age gate: show GMA card only if the most recent assessment is ≤5 months
  const infantAgeMonths: number | null = useMemo(() => {
    const newest = rows[0];
    if (!newest || newest.ageMonths === null) return null;
    return newest.ageMonths;
  }, [rows]);

  const showGMA = infantAgeMonths !== null && isGMAApplicableByMonths(infantAgeMonths);

  // Derive corrected age in weeks from months (approximation without gestational data)
  const correctedAgeWeeks = infantAgeMonths !== null ? Math.round(infantAgeMonths * 4.33) : 0;

  const handleGMAComplete = (result: GMAScreeningResult) => {
    setGmaSubmitted(result);
    // Persist to session so the clinician page can read it
    try {
      const existing = readSession<Record<string, unknown>>() ?? {};
      writeSession({ ...existing, gmaScreeningResult: result } as Record<string, unknown>);
    } catch { /* ignore */ }
  };

  const latestClinicianFeedback = useMemo(() => {
    const rowsWithFeedback = rows.filter((row) => row.clinicianFeedbackNote);
    if (rowsWithFeedback.length === 0) {
      return null;
    }

    return [...rowsWithFeedback].sort((a, b) => {
      const aTime = a.clinicianFeedbackUpdatedAt ? Date.parse(a.clinicianFeedbackUpdatedAt) : 0;
      const bTime = b.clinicianFeedbackUpdatedAt ? Date.parse(b.clinicianFeedbackUpdatedAt) : 0;
      return bTime - aTime;
    })[0];
  }, [rows]);

  const stats = useMemo(() => ({
    total: rows.length,
    stable: rows.filter(r => r.status === "stable").length,
    followUp: rows.filter(r => r.status === "follow_up").length,
    retake: rows.filter(r => r.status === "retake").length,
  }), [rows]);

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute -right-32 -top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />

      {/* Header */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between border-b border-border/60 bg-card/80 px-4 py-4 backdrop-blur-sm sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Stethoscope className="h-4 w-4" />
          </span>
          <div>
            <span className="block text-sm font-semibold tracking-tight">Pedi-Growth</span>
            <span className="block text-[10px] text-muted-foreground">Parent Portal</span>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 text-[11px]">
            <UserCircle className="h-3 w-3" />
            Parent / Caregiver
          </Badge>
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">← Switch Portal</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">

        {/* Welcome banner */}
        <section className="med-slide-up medical-surface p-6 sm:p-7">
          <div className="space-y-1">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Parent Dashboard</p>
              <h1 className="medical-title text-3xl font-semibold text-foreground">Welcome back</h1>
              <p className="text-sm text-muted-foreground">
                Start a new gait assessment for your child, or review previous results below.
              </p>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="med-slide-up med-stagger-1 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Total Assessments", value: stats.total, icon: Activity },
            { label: "Stable", value: stats.stable, icon: CheckCircle2 },
            { label: "Follow-Up Needed", value: stats.followUp, icon: AlertTriangle },
            { label: "Retake Suggested", value: stats.retake, icon: RefreshCw },
          ].map((s) => (
            <Card key={s.label} className="bg-card shadow-[0_12px_30px_rgba(14,31,41,0.07)]">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-semibold text-foreground">
                    {stats.total === 0 ? "—" : s.value}
                  </p>
                  {stats.total === 0 && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground/70">Run first assessment</p>
                  )}
                </div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="h-4 w-4" />
                </span>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Quick action cards */}
        <section className="med-slide-up med-stagger-2 grid gap-4 sm:grid-cols-3">
          <Card className="border-border/60 bg-card transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ClipboardList className="h-4 w-4 text-primary" />
                Start Intake Form
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Enter your child&apos;s age, mobility status and key concerns. Takes about 2 minutes.
              </p>
              <Link href="/start">
                <Button size="sm" className="w-full gap-2 rounded-lg text-xs">
                  Begin Intake <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileClock className="h-4 w-4 text-primary" />
                Assessment History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Review all past assessments, concern levels, quality notes and clinician guidance.
              </p>
              <Link href="/history">
                <Button size="sm" variant="outline" className="w-full gap-2 rounded-lg text-xs">
                  Open History <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Stethoscope className="h-4 w-4 text-primary" />
                Clinician Feedback
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Published clinician notes are attached to each assessment and shown here.
              </p>
              {latestClinicianFeedback ? (
                <div className="rounded-lg border border-emerald-300/60 bg-emerald-50/60 p-2.5 text-[11px] text-emerald-900">
                  <p className="font-semibold">Latest feedback for {latestClinicianFeedback.childName}</p>
                  <p className="mt-1 text-emerald-900/90">{latestClinicianFeedback.clinicianFeedbackNote}</p>
                  <p className="mt-1 text-emerald-900/70">
                    Updated: {latestClinicianFeedback.clinicianFeedbackUpdatedAt
                      ? new Date(latestClinicianFeedback.clinicianFeedbackUpdatedAt).toLocaleString()
                      : "Unknown"}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-2 text-center text-[11px] text-muted-foreground">
                  No clinician feedback published yet
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* GMA Early Motor Screening — age-gated, only for infants 0-5 months */}
        {showGMA && (
          <section className="med-slide-up med-stagger-2">
            <Card className="border-violet-200 bg-violet-50/20 shadow-[0_12px_30px_rgba(14,31,41,0.07)]">
              <CardHeader className="border-b border-violet-100 pb-3">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base text-violet-900">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-sm">
                    &#x1FAF6;
                  </span>
                  General Movements Screening
                  <Badge variant="outline" className="ml-auto border-violet-300 bg-violet-50 text-[10px] text-violet-800">
                    Prechtl GMA &middot; {infantAgeMonths}m old
                  </Badge>
                </CardTitle>
                <p className="text-xs text-violet-700/80">
                  Your child&apos;s age ({infantAgeMonths} months) is within the General Movements Assessment
                  window. This quick observation checklist helps your clinician identify early motor development
                  patterns. Complete it after watching your baby during a calm, awake period.
                </p>
              </CardHeader>
              <CardContent className="pt-4">
                <GMAScreeningChecklist
                  correctedAgeWeeks={correctedAgeWeeks}
                  onComplete={handleGMAComplete}
                  existingResult={gmaSubmitted}
                  clinicianView={false}
                />
              </CardContent>
            </Card>
          </section>
        )}

        {/* Recent Assessments table — real session data */}
        <Card className="med-slide-up med-stagger-3 overflow-hidden border-border/70">
          <CardHeader className="border-b border-border/60 bg-card pb-4">
            <CardTitle className="text-lg">Recent Assessments</CardTitle>
            <p className="text-xs text-muted-foreground">
              All assessments recorded in this session on this device.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <FileSearch className="h-5 w-5" />
                </span>
                <p className="text-sm font-medium text-foreground">No assessments yet</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Run a new intake and complete capture to generate your first result. It will appear here automatically.
                </p>
                <Link href="/start">
                  <Button variant="outline" className="gap-2 text-xs">
                    Start First Assessment <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-surface-container-low text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Child</th>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Observation</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const meta = statusMeta(row.status);
                      const Icon = meta.Icon;
                      return (
                        <tr key={row.id} className="border-b border-border/50 bg-card last:border-b-0 hover:bg-surface-container-low/40 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-foreground">{row.childName}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.ageMonths !== null ? `${row.ageMonths} months` : "Age unknown"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {row.analyzedAt ? new Date(row.analyzedAt).toLocaleString() : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-foreground">{row.concernLabel}</p>
                            {row.summary && (
                              <p className="mt-0.5 max-w-xs text-xs text-muted-foreground line-clamp-2">{row.summary}</p>
                            )}
                            {row.clinicianFeedbackNote && (
                              <p className="mt-1 max-w-xs text-xs text-emerald-700 line-clamp-2">
                                Clinician feedback: {row.clinicianFeedbackNote}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`gap-1.5 text-[10px] ${meta.cls}`}>
                              <Icon className="h-3 w-3" />
                              {meta.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/results/${row.id}`}>
                              <Button size="sm" className="gap-1.5 rounded-lg text-xs">
                                Open Result <ArrowRight className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
