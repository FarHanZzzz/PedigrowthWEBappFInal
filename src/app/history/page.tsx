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
  Filter,
  RefreshCw,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CONCERN_LABELS,
  FOLLOWUP_BADGE_STYLES,
  RUN_TONE_BADGE_STYLES,
  toConcernLevel,
} from "@/lib/presentation/severity";
import { collectResultIds, readResultRaw } from "@/lib/session/sessionStorage";
import { fetchRecentResultsFromCloud, type CloudResultRecord } from "@/lib/db/cloudStorage";

type HistoryStatus = "stable" | "follow_up" | "retake";

interface HistoryRow {
  id: string;
  childName: string;
  ageMonths: number | null;
  analyzedAt: string | null;
  concernLevel: string;
  confidenceNote: string;
  reportSummary: string | null;
  nextStep: string | null;
  status: HistoryStatus;
  qualityResult: string;
  routeLabel: string;
}

interface ParsedResultSummary {
  run?: { classification?: string; analyzedAt?: string };
  assessmentMode?: string;
  quality?: { result?: string; confidenceNotes?: string };
  concerns?: { overallLevel?: string; viewLabel?: string };
  reports?: {
    caregiver?: {
      observationsText?: string;
      monitoringGuidance?: string;
    };
  };
  trace?: { pipeline?: { direction?: string } };
  session?: { nickname?: string; ageMonths?: number };
  analyzedAt?: string;
}

function isAnalysisRecord(result: ParsedResultSummary): boolean {
  return Boolean(
    result?.run ||
      result?.assessmentMode ||
      result?.quality ||
      result?.concerns ||
      result?.reports ||
      result?.trace,
  );
}

function toHistoryRow(id: string, result: ParsedResultSummary): HistoryRow | null {
  if (!isAnalysisRecord(result)) {
    return null;
  }

  const analyzedAt = result?.analyzedAt ?? result?.run?.analyzedAt ?? null;
  const routeLabel =
    result?.concerns?.viewLabel ??
    (result?.trace?.pipeline?.direction
      ? `Direction: ${String(result.trace.pipeline.direction)}`
      : "Route unavailable");

  return {
    id,
    childName: String(result?.session?.nickname ?? "Child"),
    ageMonths: typeof result?.session?.ageMonths === "number" ? result.session.ageMonths : null,
    analyzedAt,
    concernLevel: String(result?.concerns?.overallLevel ?? "none"),
    confidenceNote: String(result?.quality?.confidenceNotes ?? "No confidence note available."),
    reportSummary:
      typeof result?.reports?.caregiver?.observationsText === "string"
        ? result.reports.caregiver.observationsText
        : null,
    nextStep:
      typeof result?.reports?.caregiver?.monitoringGuidance === "string"
        ? result.reports.caregiver.monitoringGuidance
        : null,
    status: deriveStatus(result),
    qualityResult: String(result?.quality?.result ?? "unknown"),
    routeLabel,
  };
}

function deriveStatus(result: ParsedResultSummary): HistoryStatus {
  if (result?.run?.classification === "validation_failure") {
    return "retake";
  }

  if (result?.assessmentMode === "cannot_assess" || result?.quality?.result === "fail") {
    return "retake";
  }

  const overall = String(result?.concerns?.overallLevel ?? "none");
  if (overall === "moderate" || overall === "significant") {
    return "follow_up";
  }

  return "stable";
}

function buildRowsFromSessionStorage(): HistoryRow[] {
  if (typeof window === "undefined") {
    return [];
  }

  const ids = collectResultIds(window.sessionStorage);

  const rows: HistoryRow[] = [];

  for (const id of ids) {
    const raw = readResultRaw(id);

    if (!raw) {
      continue;
    }

    try {
      const result = JSON.parse(raw) as ParsedResultSummary;
      const row = toHistoryRow(id, result);
      if (row) {
        rows.push(row);
      }
    } catch {
      // Skip malformed session entries.
    }
  }

  return rows.sort((a, b) => {
    const aTime = a.analyzedAt ? Date.parse(a.analyzedAt) : 0;
    const bTime = b.analyzedAt ? Date.parse(b.analyzedAt) : 0;
    return bTime - aTime;
  });
}

function buildRowsFromCloudRecords(records: CloudResultRecord[]): HistoryRow[] {
  const rows: HistoryRow[] = [];

  for (const record of records) {
    const payload = (record.payload ?? null) as ParsedResultSummary | null;
    if (!payload || typeof payload !== "object") {
      continue;
    }

    const row = toHistoryRow(record.id, {
      ...payload,
      analyzedAt:
        typeof payload.analyzedAt === "string"
          ? payload.analyzedAt
          : record.updated_at ?? record.created_at ?? undefined,
    });

    if (row) {
      rows.push(row);
    }
  }

  return rows;
}

function statusMeta(status: HistoryStatus) {
  if (status === "stable") {
    return {
      label: "Stable",
      className: FOLLOWUP_BADGE_STYLES.routine,
      icon: CheckCircle2,
    };
  }

  if (status === "follow_up") {
    return {
      label: "Follow-Up",
      className: FOLLOWUP_BADGE_STYLES.earlier_review,
      icon: AlertTriangle,
    };
  }

  return {
    label: "Retake Recommended",
    className: RUN_TONE_BADGE_STYLES.destructive,
    icon: RefreshCw,
  };
}

function humanConcern(level: string): string {
  const normalized = toConcernLevel(level);
  return CONCERN_LABELS[normalized];
}

export default function HistoryPage() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | HistoryStatus>("all");
  const [localRows, setLocalRows] = useState<HistoryRow[]>([]);
  const [cloudRows, setCloudRows] = useState<HistoryRow[]>([]);

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

  const allRows = useMemo(() => {
    const byId = new Map<string, HistoryRow>();

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
      const aTime = a.analyzedAt ? Date.parse(a.analyzedAt) : 0;
      const bTime = b.analyzedAt ? Date.parse(b.analyzedAt) : 0;
      return bTime - aTime;
    });
  }, [cloudRows, localRows]);

  const rows = useMemo(
    () =>
      allRows.filter((row) => {
        const matchesQuery =
          query.trim().length === 0 ||
          row.childName.toLowerCase().includes(query.toLowerCase()) ||
          row.id.toLowerCase().includes(query.toLowerCase());
        const matchesStatus = statusFilter === "all" || row.status === statusFilter;

        return matchesQuery && matchesStatus;
      }),
    [allRows, query, statusFilter]
  );

  const stats = useMemo(() => {
    const stable = allRows.filter((row) => row.status === "stable").length;
    const followUp = allRows.filter((row) => row.status === "follow_up").length;
    const retake = allRows.filter((row) => row.status === "retake").length;

    return {
      total: allRows.length,
      stable,
      followUp,
      retake,
    };
  }, [allRows]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <section className="medical-surface med-slide-up p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Clinical Workspace
            </p>
            <h1 className="medical-title text-3xl font-semibold text-foreground">Assessment History</h1>
            <p className="text-sm text-muted-foreground">
              Parent dashboard (cross-device cloud sync): review previous runs, next steps, and reopen evidence quickly.
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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Runs", value: stats.total, icon: Activity },
          { label: "Stable", value: stats.stable, icon: CheckCircle2 },
          { label: "Follow-Up", value: stats.followUp, icon: AlertTriangle },
          { label: "Retake", value: stats.retake, icon: RefreshCw },
        ].map((item) => (
          <Card key={item.label} className="med-slide-up bg-card shadow-[0_12px_30px_rgba(14,31,41,0.08)]">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                <p className="text-2xl font-semibold text-foreground">{item.value}</p>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <item.icon className="h-4 w-4" />
              </span>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="med-slide-up med-stagger-1 overflow-hidden border-border/70">
        <CardHeader className="border-b border-border/60 bg-card pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">Recorded Analyses</CardTitle>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by child or result ID"
                  className="h-9 w-full rounded-lg border border-border/70 bg-surface pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-72"
                />
              </div>

              <div className="relative">
                <Filter className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "all" | HistoryStatus)}
                  className="h-9 rounded-lg border border-border/70 bg-surface pl-8 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">All statuses</option>
                  <option value="stable">Stable</option>
                  <option value="follow_up">Follow-Up</option>
                  <option value="retake">Retake</option>
                </select>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FileSearch className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium text-foreground">No completed analyses found in this session.</p>
              <p className="max-w-md text-xs text-muted-foreground">
                Run a new intake and complete capture to generate a connected result page. Once generated, it will appear here automatically.
              </p>
              <Link href="/start">
                <Button variant="outline" className="gap-2 text-xs">
                  Start First Analysis
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-surface-container-low text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Child</th>
                    <th className="px-4 py-3 font-semibold">Captured</th>
                    <th className="px-4 py-3 font-semibold">Observation</th>
                    <th className="px-4 py-3 font-semibold">Next Step</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Quality</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const meta = statusMeta(row.status);
                    const StatusIcon = meta.icon;

                    return (
                      <tr key={row.id} className="border-b border-border/50 bg-card last:border-b-0 hover:bg-surface-container-low/40">
                        <td className="px-4 py-3 align-top">
                          <p className="font-semibold text-foreground">{row.childName}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.ageMonths !== null ? `${row.ageMonths} months` : "Age unknown"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">ID: {row.id}</p>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                          {row.analyzedAt ? new Date(row.analyzedAt).toLocaleString() : "Timestamp unavailable"}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="text-sm font-semibold text-foreground">{humanConcern(row.concernLevel)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{row.routeLabel}</p>
                          {row.reportSummary && (
                            <p className="mt-1 text-xs text-foreground/80">{row.reportSummary}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="max-w-xs text-xs text-foreground/80">
                            {row.nextStep ?? "Open result to generate or review caregiver next-step guidance."}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Badge variant="outline" className={`gap-1.5 text-[10px] ${meta.className}`}>
                            <StatusIcon className="h-3 w-3" />
                            {meta.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="max-w-sm text-[11px] text-muted-foreground">{row.confidenceNote}</p>
                          <p className="mt-1 text-[11px] font-medium text-foreground/80">Quality: {row.qualityResult}</p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Link href={`/results/${row.id}`}>
                            <Button size="sm" className="gap-1.5 rounded-lg text-xs">
                              Open Result
                              <ArrowRight className="h-3.5 w-3.5" />
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
    </div>
  );
}
