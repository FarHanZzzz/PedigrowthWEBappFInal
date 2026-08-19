"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Database,
  FileSearch,
  RefreshCw,
  Shield,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { collectResultIds, readResultRaw } from "@/lib/session/sessionStorage";
import { fetchRecentResultsFromCloud, type CloudResultRecord } from "@/lib/db/cloudStorage";
import {
  CONCERN_LABELS,
  CONCERN_BADGE_STYLES,
  FOLLOWUP_BADGE_STYLES,
  FOLLOWUP_SHORT_LABELS,
  RUN_TONE_BADGE_STYLES,
  toConcernLevel,
  toFollowupPriority,
} from "@/lib/presentation/severity";

interface ParsedResult {
  run?: { classification?: string; analyzedAt?: string };
  assessmentMode?: string;
  quality?: { result?: string; confidenceNotes?: string };
  concerns?: { overallLevel?: string; followupPriority?: string; viewLabel?: string };
  session?: { nickname?: string; ageMonths?: number };
  analyzedAt?: string;
  trace?: { pipeline?: { direction?: string } };
}

type RowStatus = "stable" | "follow_up" | "retake";

function deriveStatus(r: ParsedResult): RowStatus {
  if (r?.run?.classification === "validation_failure") return "retake";
  if (r?.assessmentMode === "cannot_assess" || r?.quality?.result === "fail") return "retake";
  const lvl = String(r?.concerns?.overallLevel ?? "none");
  if (lvl === "moderate" || lvl === "significant") return "follow_up";
  return "stable";
}

interface AssessmentRow {
  id: string;
  childName: string;
  ageMonths: number | null;
  analyzedAt: string | null;
  concernLevel: string;
  followupPriority: string;
  qualityResult: string;
  confidenceNotes: string;
  status: RowStatus;
  routeLabel: string;
}

function buildAssessmentsFromSessionStorage(): AssessmentRow[] {
  if (typeof window === "undefined") return [];
  const ids = collectResultIds(window.sessionStorage);
  const rows: AssessmentRow[] = [];
  for (const id of ids) {
    const raw = readResultRaw(id);
    if (!raw) continue;
    try {
      const r = JSON.parse(raw) as ParsedResult;
      const routeLabel =
        r?.concerns?.viewLabel ??
        (r?.trace?.pipeline?.direction ? `Direction: ${String(r.trace.pipeline.direction)}` : "—");
      rows.push({
        id,
        childName: String(r?.session?.nickname ?? "Child"),
        ageMonths: typeof r?.session?.ageMonths === "number" ? r.session.ageMonths : null,
        analyzedAt: r?.analyzedAt ?? r?.run?.analyzedAt ?? null,
        concernLevel: String(r?.concerns?.overallLevel ?? "none"),
        followupPriority: String(r?.concerns?.followupPriority ?? "routine"),
        qualityResult: String(r?.quality?.result ?? "unknown"),
        confidenceNotes: String(r?.quality?.confidenceNotes ?? "—"),
        status: deriveStatus(r),
        routeLabel,
      });
    } catch { /* skip */ }
  }
  return rows.sort((a, b) => {
    const at = a.analyzedAt ? Date.parse(a.analyzedAt) : 0;
    const bt = b.analyzedAt ? Date.parse(b.analyzedAt) : 0;
    return bt - at;
  });
}




function buildAssessmentsFromCloud(records: CloudResultRecord[]): AssessmentRow[] {
  const rows: AssessmentRow[] = [];

  for (const record of records) {
    const payload = (record.payload ?? null) as ParsedResult | null;
    if (!payload || typeof payload !== "object") {
      continue;
    }

    const routeLabel =
      payload?.concerns?.viewLabel ??
      (payload?.trace?.pipeline?.direction ? `Direction: ${String(payload.trace.pipeline.direction)}` : "—");

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
      concernLevel: String(payload?.concerns?.overallLevel ?? "none"),
      followupPriority: String(payload?.concerns?.followupPriority ?? "routine"),
      qualityResult: String(payload?.quality?.result ?? "unknown"),
      confidenceNotes: String(payload?.quality?.confidenceNotes ?? "—"),
      status: deriveStatus(payload),
      routeLabel,
    });
  }

  return rows.sort((a, b) => {
    const at = a.analyzedAt ? Date.parse(a.analyzedAt) : 0;
    const bt = b.analyzedAt ? Date.parse(b.analyzedAt) : 0;
    return bt - at;
  });
}

function statusMeta(status: RowStatus) {
  if (status === "stable") return { label: "Stable", cls: FOLLOWUP_BADGE_STYLES.routine, Icon: CheckCircle2 };
  if (status === "retake") return { label: "Retake", cls: RUN_TONE_BADGE_STYLES.destructive, Icon: RefreshCw };
  return { label: "Follow-Up", cls: FOLLOWUP_BADGE_STYLES.earlier_review, Icon: AlertTriangle };
}

export default function AdminPortalPage() {
  const [localRows, setLocalRows] = useState<AssessmentRow[]>([]);
  const [cloudRows, setCloudRows] = useState<AssessmentRow[]>([]);

  useEffect(() => {
    let active = true;

    const hydrateLocal = () => {
      if (!active) return;
      setLocalRows(buildAssessmentsFromSessionStorage());
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
          setCloudRows(buildAssessmentsFromCloud(records));
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
    const byId = new Map<string, AssessmentRow>();

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

  const stats = useMemo(() => ({
    total: rows.length,
    stable: rows.filter(r => r.status === "stable").length,
    followUp: rows.filter(r => r.status === "follow_up").length,
    retake: rows.filter(r => r.status === "retake").length,
    qPass: rows.filter(r => r.qualityResult === "pass").length,
    qBorderline: rows.filter(r => r.qualityResult === "borderline").length,
    qFail: rows.filter(r => r.qualityResult === "fail").length,
  }), [rows]);

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute -right-24 -top-16 h-56 w-56 rounded-full bg-muted/20 blur-3xl" />

      {/* Header */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between border-b border-border/60 bg-card/80 px-4 py-4 backdrop-blur-sm sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Stethoscope className="h-4 w-4" />
          </span>
          <div>
            <span className="block text-sm font-semibold tracking-tight">Pedi-Growth</span>
            <span className="block text-[10px] text-muted-foreground">Admin Console</span>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 text-[11px]">
            <Shield className="h-3 w-3" />
            System Administrator
          </Badge>
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">← Switch Portal</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6">

        {/* Banner — matches history page style */}
        <section className="medical-surface med-slide-up p-6 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Admin Console
              </p>
              <h1 className="medical-title text-3xl font-semibold text-foreground">System Overview</h1>
              <p className="text-sm text-muted-foreground">
                Full visibility across all assessment activity, quality results, and clinical routing on this platform.
              </p>
            </div>
            <Link href="/start">
              <Button className="cta-gradient gap-2 rounded-xl" size="lg">
                <ClipboardList className="h-4 w-4" />
                New Intake
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        {/* Assessment stats — 4-column like history page */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total Assessments", value: stats.total, icon: Activity },
            { label: "Stable", value: stats.stable, icon: CheckCircle2 },
            { label: "Follow-Up", value: stats.followUp, icon: AlertTriangle },
            { label: "Retake", value: stats.retake, icon: RefreshCw },
          ].map((item) => (
            <Card key={item.label} className="med-slide-up bg-card shadow-[0_12px_30px_rgba(14,31,41,0.08)]">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                  <p className="text-2xl font-semibold text-foreground">
                    {stats.total === 0 ? "—" : item.value}
                  </p>
                </div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <item.icon className="h-4 w-4" />
                </span>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Quality breakdown */}
        {rows.length > 0 && (
          <section className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Quality: Pass", value: stats.qPass, cls: "border-emerald-300 bg-emerald-50 text-emerald-800" },
              { label: "Quality: Borderline", value: stats.qBorderline, cls: "border-amber-300 bg-amber-50 text-amber-900" },
              { label: "Quality: Fail", value: stats.qFail, cls: "border-red-300 bg-red-50 text-red-900" },
            ].map((item) => (
              <Card key={item.label} className="med-slide-up bg-card">
                <CardContent className="p-4">
                  <Badge variant="outline" className={`mb-2 text-[10px] ${item.cls}`}>{item.label}</Badge>
                  <p className="text-2xl font-semibold text-foreground">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{stats.total > 0 ? `${Math.round((item.value / stats.total) * 100)}% of assessments` : ""}</p>
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        {/* Full assessment records table */}
        <Card className="med-slide-up med-stagger-1 overflow-hidden border-border/70">
          <CardHeader className="border-b border-border/60 bg-card pb-4">
            <CardTitle className="text-lg">All Assessment Records</CardTitle>
            <p className="text-xs text-muted-foreground">
              Complete system-wide log of all assessments recorded in this session.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <FileSearch className="h-5 w-5" />
                </span>
                <p className="text-sm font-medium text-foreground">No assessment data in this session</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  No assessments have been completed yet. Once a parent or clinician completes
                  an intake and analysis, all records will appear here automatically.
                </p>
                <Link href="/start">
                  <Button variant="outline" className="gap-2 text-xs">
                    Start First Assessment
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-surface-container-low text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Patient</th>
                      <th className="px-4 py-3 font-semibold">Assessed At</th>
                      <th className="px-4 py-3 font-semibold">Concern</th>
                      <th className="px-4 py-3 font-semibold">Follow-Up</th>
                      <th className="px-4 py-3 font-semibold">Quality</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const meta = statusMeta(row.status);
                      const Icon = meta.Icon;
                      const concernBadge = CONCERN_BADGE_STYLES[toConcernLevel(row.concernLevel)];
                      const fpBadge = FOLLOWUP_BADGE_STYLES[toFollowupPriority(row.followupPriority)];
                      const fpLabel = FOLLOWUP_SHORT_LABELS[toFollowupPriority(row.followupPriority)];
                      return (
                        <tr key={row.id} className="border-b border-border/50 bg-card last:border-b-0 hover:bg-surface-container-low/40 transition-colors">
                          <td className="px-4 py-3 align-top">
                            <p className="font-semibold text-foreground">{row.childName}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.ageMonths !== null ? `${row.ageMonths} months` : "Age unknown"}
                            </p>
                            <p className="text-[11px] text-muted-foreground/70">ID: {row.id}</p>
                          </td>
                          <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                            {row.analyzedAt ? new Date(row.analyzedAt).toLocaleString() : "—"}
                            <p className="mt-0.5 text-[11px] text-muted-foreground/70">{row.routeLabel}</p>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <Badge variant="outline" className={`text-[10px] ${concernBadge}`}>
                              {CONCERN_LABELS[toConcernLevel(row.concernLevel)]}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <Badge variant="outline" className={`text-[10px] ${fpBadge}`}>
                              {fpLabel}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <p className="text-xs font-medium capitalize text-foreground">{row.qualityResult}</p>
                            <p className="mt-0.5 max-w-45 text-[11px] text-muted-foreground line-clamp-2">
                              {row.confidenceNotes}
                            </p>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <Badge variant="outline" className={`gap-1.5 text-[10px] ${meta.cls}`}>
                              <Icon className="h-3 w-3" />
                              {meta.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-col gap-1.5">
                              <Link href={`/results/${row.id}`}>
                                <Button size="sm" className="w-full gap-1.5 rounded-lg text-xs">
                                  Patient View
                                </Button>
                              </Link>
                              <Link href={`/results/${row.id}/clinician`}>
                                <Button size="sm" variant="outline" className="w-full gap-1.5 rounded-lg text-xs">
                                  Clinic Packet
                                </Button>
                              </Link>
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

        {/* DB Architecture */}
        <Card className="med-slide-up border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Production: Full Supabase RBAC backend</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  In production this console reads from{" "}
                  <code className="rounded bg-muted px-1 font-mono text-[11px]">user_profiles</code>,{" "}
                  <code className="rounded bg-muted px-1 font-mono text-[11px]">assessments</code>,{" "}
                  <code className="rounded bg-muted px-1 font-mono text-[11px]">audit_events</code>, and{" "}
                  <code className="rounded bg-muted px-1 font-mono text-[11px]">policy_violations</code> —
                  all already defined in <code className="rounded bg-muted px-1 font-mono text-[11px]">supabase/migrations/001_initial_schema.sql</code>.
                  Admin actions (clinician verification, link revocation) use a Supabase service-role API call, never exposed to patient or clinician roles.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { icon: ShieldCheck, label: "Service Role (server-only)" },
                    { icon: Shield, label: "RLS on all tables" },
                    { icon: Activity, label: "Realtime audit stream" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
                      <item.icon className="h-3 w-3 text-primary/70" />
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
