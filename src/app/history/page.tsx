"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAgeMonths } from "@/lib/presentation/age";
import {
  CONCERN_LABELS,
  FOLLOWUP_BADGE_STYLES,
  RUN_TONE_BADGE_STYLES,
  toConcernLevel,
} from "@/lib/presentation/severity";
import { collectResultIds, readResultRaw } from "@/lib/session/sessionStorage";
import { deleteAssessmentAsAdmin } from "@/lib/session/deleteAssessment";
import { fetchRecentResultsFromCloud, type CloudResultRecord } from "@/lib/db/cloudStorage";
import { useAuthRole } from "@/lib/auth/useAuthRole";
import HistoryCardCover from "@/components/history/HistoryCardCover";
import type { HistoryStatus } from "@/lib/history/historyTypes";

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
  sessionId: string | null;
  videoUrl: string | null;
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
  trace?: { sessionId?: string; pipeline?: { direction?: string } };
  session?: { nickname?: string; ageMonths?: number };
  analyzedAt?: string;
  videoUrl?: string;
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
    sessionId:
      typeof result?.trace?.sessionId === "string" ? result.trace.sessionId : null,
    videoUrl: typeof result?.videoUrl === "string" ? result.videoUrl : null,
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
  const role = useAuthRole();
  const resultHref = (id: string) =>
    role === "clinician" ? `/results/${id}/clinician` : `/results/${id}`;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | HistoryStatus>("all");
  const [localRows, setLocalRows] = useState<HistoryRow[]>([]);
  const [cloudRows, setCloudRows] = useState<HistoryRow[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const handleDeleteAssessment = async (row: HistoryRow) => {
    if (pendingDeleteId !== row.id) {
      setPendingDeleteId(row.id);
      return;
    }

    setDeletingId(row.id);
    try {
      await deleteAssessmentAsAdmin(row.id);
      setLocalRows((current) => current.filter((item) => item.id !== row.id));
      setCloudRows((current) => current.filter((item) => item.id !== row.id));
      setPendingDeleteId(null);
    } catch (error) {
      console.error("Failed to delete assessment:", error);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="medical-title text-2xl font-semibold sm:text-3xl">Past walking checks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reopen a summary on this phone or any device where it was saved.
          </p>
        </div>
        <Link href="/start">
          <Button className="rounded-xl" size="lg">
            New check
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "All", value: stats.total },
          { label: "Follow-up", value: stats.followUp },
          { label: "Retake", value: stats.retake },
        ].map((item) => (
          <div key={item.label} className="medical-surface px-3 py-3 text-center">
            <p className="text-xl font-semibold">{item.value}</p>
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name"
            className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "all" | HistoryStatus)}
          className="h-11 rounded-xl border border-border bg-card px-3 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="stable">On track</option>
          <option value="follow_up">Follow-up</option>
          <option value="retake">Retake</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="medical-surface flex flex-col items-center gap-4 px-4 py-14 text-center">
          <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileSearch className="h-7 w-7" />
          </span>
          <div className="space-y-1">
            <p className="text-lg font-semibold">No walking checks yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Record the first 10-second clip. It will show up here like a photo of that walk.
            </p>
          </div>
          <Link href="/start">
            <Button size="lg" className="rounded-xl">
              Record the first 10-second clip
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((row) => {
            const meta = statusMeta(row.status);
            const StatusIcon = meta.icon;
            const isPending = pendingDeleteId === row.id;
            const isDeleting = deletingId === row.id;
            return (
              <article
                key={row.id}
                className="medical-surface group overflow-hidden transition-shadow hover:shadow-md"
              >
                <Link href={resultHref(row.id)} className="block">
                  <HistoryCardCover
                    resultId={row.id}
                    sessionId={row.sessionId}
                    videoUrl={row.videoUrl}
                    childName={row.childName}
                    status={row.status}
                  />
                  <div className="space-y-2 p-4 pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{row.childName}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.ageMonths !== null ? formatAgeMonths(row.ageMonths) : "Age unknown"}
                          {row.analyzedAt ? ` · ${new Date(row.analyzedAt).toLocaleDateString()}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 gap-1 ${meta.className}`}>
                        <StatusIcon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium">{humanConcern(row.concernLevel)}</p>
                    {row.reportSummary && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{row.reportSummary}</p>
                    )}
                  </div>
                </Link>
                {role === "admin" && (
                  <div className="px-4 pb-4">
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => {
                        void handleDeleteAssessment(row);
                      }}
                      className={`inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold disabled:opacity-50 ${
                        isPending
                          ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
                          : "border-red-300 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-500/50 dark:bg-red-950/40 dark:text-red-200"
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {isDeleting ? "Deleting…" : isPending ? "Confirm delete" : "Delete assessment"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
