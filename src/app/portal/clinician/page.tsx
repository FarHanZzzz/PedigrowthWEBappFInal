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
  FileText,
  RefreshCw,
  Stethoscope,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { collectResultIds, readResultRaw } from "@/lib/session/sessionStorage";
import { fetchRecentResultsFromCloud, type CloudResultRecord } from "@/lib/db/cloudStorage";
import {
  CONCERN_LABELS,
  FOLLOWUP_BADGE_STYLES,
  FOLLOWUP_SHORT_LABELS,
  CONCERN_BADGE_STYLES,
  RUN_TONE_BADGE_STYLES,
  toConcernLevel,
  toFollowupPriority,
} from "@/lib/presentation/severity";

interface ParsedResult {
  run?: { classification?: string; analyzedAt?: string };
  assessmentMode?: string;
  quality?: { result?: string; confidenceNotes?: string };
  concerns?: { overallLevel?: string; followupPriority?: string; viewLabel?: string };
  reports?: { caregiver?: { observationsText?: string } };
  clinicianFeedback?: { note?: string; updatedAt?: string; visibility?: string };
  session?: { nickname?: string; ageMonths?: number };
  analyzedAt?: string;
}

type RowStatus = "stable" | "follow_up" | "retake";

function deriveStatus(r: ParsedResult): RowStatus {
  if (r?.run?.classification === "validation_failure") return "retake";
  if (r?.assessmentMode === "cannot_assess" || r?.quality?.result === "fail") return "retake";
  const lvl = String(r?.concerns?.overallLevel ?? "none");
  if (lvl === "significant") return "follow_up";
  if (lvl === "moderate") return "follow_up";
  return "stable";
}

interface PatientRow {
  id: string;
  childName: string;
  ageMonths: number | null;
  analyzedAt: string | null;
  concernLevel: string;
  concernLabel: string;
  followupPriority: string;
  qualityResult: string;
  status: RowStatus;
  summary: string | null;
  hasPublishedFeedback: boolean;
  feedbackUpdatedAt: string | null;
}

function buildPatientsFromSessionStorage(): PatientRow[] {
  if (typeof window === "undefined") return [];
  const ids = collectResultIds(window.sessionStorage);
  const rows: PatientRow[] = [];
  for (const id of ids) {
    const raw = readResultRaw(id);
    if (!raw) continue;
    try {
      const r = JSON.parse(raw) as ParsedResult;
      const concernLevel = String(r?.concerns?.overallLevel ?? "none");
      rows.push({
        id,
        childName: String(r?.session?.nickname ?? "Child"),
        ageMonths: typeof r?.session?.ageMonths === "number" ? r.session.ageMonths : null,
        analyzedAt: r?.analyzedAt ?? r?.run?.analyzedAt ?? null,
        concernLevel,
        concernLabel: CONCERN_LABELS[toConcernLevel(concernLevel)],
        followupPriority: String(r?.concerns?.followupPriority ?? "routine"),
        qualityResult: String(r?.quality?.result ?? "unknown"),
        status: deriveStatus(r),
        summary: r?.reports?.caregiver?.observationsText ?? null,
        hasPublishedFeedback:
          typeof r?.clinicianFeedback?.note === "string" && r.clinicianFeedback.note.trim().length > 0,
        feedbackUpdatedAt:
          typeof r?.clinicianFeedback?.updatedAt === "string" ? r.clinicianFeedback.updatedAt : null,
      });
    } catch { /* skip */ }
  }
  return rows.sort((a, b) => {
    const at = a.analyzedAt ? Date.parse(a.analyzedAt) : 0;
    const bt = b.analyzedAt ? Date.parse(b.analyzedAt) : 0;
    return bt - at;
  });
}

function buildPatientsFromCloud(records: CloudResultRecord[]): PatientRow[] {
  const rows: PatientRow[] = [];

  for (const record of records) {
    const payload = (record.payload ?? null) as ParsedResult | null;
    if (!payload || typeof payload !== "object") {
      continue;
    }

    const concernLevel = String(payload?.concerns?.overallLevel ?? "none");
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
      concernLevel,
      concernLabel: CONCERN_LABELS[toConcernLevel(concernLevel)],
      followupPriority: String(payload?.concerns?.followupPriority ?? "routine"),
      qualityResult: String(payload?.quality?.result ?? "unknown"),
      status: deriveStatus(payload),
      summary: payload?.reports?.caregiver?.observationsText ?? null,
      hasPublishedFeedback:
        typeof payload?.clinicianFeedback?.note === "string" && payload.clinicianFeedback.note.trim().length > 0,
      feedbackUpdatedAt:
        typeof payload?.clinicianFeedback?.updatedAt === "string" ? payload.clinicianFeedback.updatedAt : null,
    });
  }

  return rows.sort((a, b) => {
    const at = a.analyzedAt ? Date.parse(a.analyzedAt) : 0;
    const bt = b.analyzedAt ? Date.parse(b.analyzedAt) : 0;
    return bt - at;
  });
}

function statusBadgeProps(status: RowStatus) {
  if (status === "stable") return { label: "Stable", cls: FOLLOWUP_BADGE_STYLES.routine, Icon: CheckCircle2 };
  if (status === "retake") return { label: "Retake Needed", cls: RUN_TONE_BADGE_STYLES.destructive, Icon: RefreshCw };
  return { label: "Follow-Up", cls: FOLLOWUP_BADGE_STYLES.earlier_review, Icon: AlertTriangle };
}

export default function ClinicianPortalPage() {
  const [localPatients, setLocalPatients] = useState<PatientRow[]>([]);
  const [cloudPatients, setCloudPatients] = useState<PatientRow[]>([]);

  useEffect(() => {
    let active = true;

    const hydrateLocal = () => {
      if (!active) return;
      setLocalPatients(buildPatientsFromSessionStorage());
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
          setCloudPatients(buildPatientsFromCloud(records));
        })
        .catch(() => {
          if (!active) return;
          setCloudPatients([]);
        });
    };

    hydrateCloud();
    const cloudInterval = window.setInterval(hydrateCloud, 15000);

    return () => {
      active = false;
      window.clearInterval(cloudInterval);
    };
  }, []);

  const patients = useMemo(() => {
    const byId = new Map<string, PatientRow>();

    for (const row of cloudPatients) {
      byId.set(row.id, row);
    }

    for (const row of localPatients) {
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
  }, [cloudPatients, localPatients]);

  const stats = useMemo(() => ({
    total: patients.length,
    stable: patients.filter(p => p.status === "stable").length,
    followUp: patients.filter(p => p.status === "follow_up").length,
    retake: patients.filter(p => p.status === "retake").length,
  }), [patients]);

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute -left-32 -top-16 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />

      {/* Header */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between border-b border-border/60 bg-card/80 px-4 py-4 backdrop-blur-sm sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Stethoscope className="h-4 w-4" />
          </span>
          <div>
            <span className="block text-sm font-semibold tracking-tight">Pedi-Growth</span>
            <span className="block text-[10px] text-muted-foreground">Clinician Portal</span>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 text-[11px]">
            <Stethoscope className="h-3 w-3" />
            Clinician / Specialist
          </Badge>
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">← Switch Portal</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">

        {/* Banner */}
        <section className="med-slide-up medical-surface p-6 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Clinician Dashboard</p>
              <h1 className="medical-title text-3xl font-semibold text-foreground">Patient Caseload</h1>
              <p className="text-sm text-muted-foreground">
                Review all patient assessments, open clinical handoff packets, and submit follow-up notes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-xs">
                <Users className="h-3.5 w-3.5" />
                {patients.length} {patients.length === 1 ? "patient" : "patients"} in session
              </Badge>
              <Link href="/start">
                <Button className="cta-gradient gap-2 rounded-xl" size="sm">
                  <ClipboardList className="h-4 w-4" />
                  New Intake
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="med-slide-up med-stagger-1 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Total Patients", value: stats.total, icon: Users },
            { label: "Stable", value: stats.stable, icon: CheckCircle2 },
            { label: "Follow-Up", value: stats.followUp, icon: Activity },
            { label: "Retake Needed", value: stats.retake, icon: RefreshCw },
          ].map((s) => (
            <Card key={s.label} className="bg-card shadow-[0_12px_30px_rgba(14,31,41,0.07)]">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-semibold text-foreground">
                    {stats.total === 0 ? "—" : s.value}
                  </p>
                </div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="h-4 w-4" />
                </span>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Patient Table */}
        <Card className="med-slide-up med-stagger-2 overflow-hidden border-border/70">
          <CardHeader className="border-b border-border/60 bg-card pb-4">
            <CardTitle className="text-lg">Patient Assessments</CardTitle>
            <p className="text-xs text-muted-foreground">
              All assessments from this session. Click &quot;Open Packet&quot; to access the full clinical handoff view.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {patients.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <FileSearch className="h-5 w-5" />
                </span>
                <p className="text-sm font-medium text-foreground">No patient assessments yet</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  No assessments have been recorded in this session. Ask the parent to complete a new intake,
                  or start one directly below.
                </p>
                <Link href="/start">
                  <Button variant="outline" className="gap-2 text-xs">
                    Start New Intake <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-surface-container-low text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Patient</th>
                      <th className="px-4 py-3 font-semibold">Assessed</th>
                      <th className="px-4 py-3 font-semibold">Gait Observation</th>
                      <th className="px-4 py-3 font-semibold">Follow-Up Priority</th>
                      <th className="px-4 py-3 font-semibold">Quality</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((patient) => {
                      const badge = statusBadgeProps(patient.status);
                      const Icon = badge.Icon;
                      const fpBadge = FOLLOWUP_BADGE_STYLES[toFollowupPriority(patient.followupPriority)];
                      const fpLabel = FOLLOWUP_SHORT_LABELS[toFollowupPriority(patient.followupPriority)];
                      const concernBadge = CONCERN_BADGE_STYLES[toConcernLevel(patient.concernLevel)];
                      return (
                        <tr key={patient.id} className="border-b border-border/50 bg-card last:border-b-0 hover:bg-surface-container-low/40 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-foreground">{patient.childName}</p>
                            <p className="text-xs text-muted-foreground">
                              {patient.ageMonths !== null ? `${patient.ageMonths} months` : "Age unknown"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {patient.analyzedAt ? new Date(patient.analyzedAt).toLocaleString() : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-[10px] ${concernBadge}`}>
                              {patient.concernLabel}
                            </Badge>
                            {patient.summary && (
                              <p className="mt-1 max-w-xs text-[11px] text-muted-foreground line-clamp-2">{patient.summary}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-[10px] ${fpBadge}`}>
                              {fpLabel}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-foreground capitalize">
                            {patient.qualityResult}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`gap-1.5 text-[10px] ${badge.cls}`}>
                              <Icon className="h-3 w-3" />
                              {badge.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1.5">
                              <Link href={`/results/${patient.id}/clinician`}>
                                <Button size="sm" className="w-full gap-1.5 rounded-lg text-xs">
                                  <FileText className="h-3.5 w-3.5" />
                                  Open Packet
                                </Button>
                              </Link>
                              <Link href={`/results/${patient.id}`}>
                                <Button size="sm" variant="outline" className="w-full gap-1.5 rounded-lg text-xs">
                                  Patient View
                                </Button>
                              </Link>
                              <p className="text-[11px] text-muted-foreground">
                                {patient.hasPublishedFeedback
                                  ? `Feedback published${patient.feedbackUpdatedAt ? ` (${new Date(patient.feedbackUpdatedAt).toLocaleString()})` : ""}`
                                  : "No published feedback yet"}
                              </p>
                            </div>
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

        {/* Architecture info */}
        <Card className="med-slide-up med-stagger-3 border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <p className="mb-1 text-sm font-semibold text-foreground">Production: Real-time patient sync</p>
            <p className="text-xs text-muted-foreground">
              In production, patients are linked to this clinic via <code className="rounded bg-muted px-1 font-mono text-[11px]">clinic_patient_links</code>.
              When a parent completes an assessment it writes immediately to Supabase and appears here via Realtime subscription.
              In this demo build, published clinician feedback is attached to the local assessment record and appears in the parent portal for the same browser session.
              The full schema and RLS policies are in <code className="rounded bg-muted px-1 font-mono text-[11px]">supabase/migrations/</code>.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
