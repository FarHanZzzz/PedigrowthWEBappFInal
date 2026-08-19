"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  FileText,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAgeMonths } from "@/lib/presentation/age";
import { collectResultIds, readResultRaw } from "@/lib/session/sessionStorage";
import { fetchRecentResultsFromCloud, type CloudResultRecord } from "@/lib/db/cloudStorage";
import {
  CONCERN_LABELS,
  FOLLOWUP_BADGE_STYLES,
  CONCERN_BADGE_STYLES,
  RUN_TONE_BADGE_STYLES,
  toConcernLevel,
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
  const [query, setQuery] = useState("");
  const [noteFilter, setNoteFilter] = useState<"all" | "needs_note" | "reviewed">("all");

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
    needsNote: patients.filter((p) => !p.hasPublishedFeedback).length,
    reviewed: patients.filter((p) => p.hasPublishedFeedback).length,
    followUp: patients.filter((p) => p.status === "follow_up").length,
  }), [patients]);

  const visiblePatients = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return patients.filter((patient) => {
      const matchesQuery =
        needle.length === 0 ||
        patient.childName.toLowerCase().includes(needle) ||
        patient.id.toLowerCase().includes(needle);
      const matchesNote =
        noteFilter === "all" ||
        (noteFilter === "needs_note" && !patient.hasPublishedFeedback) ||
        (noteFilter === "reviewed" && patient.hasPublishedFeedback);
      return matchesQuery && matchesNote;
    });
  }, [patients, query, noteFilter]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <section className="medical-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="medical-title text-3xl font-semibold">Clinician dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Open a packet, review evidence, and send a follow-up note the family can see.
            </p>
          </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-xs">
                <Users className="h-3.5 w-3.5" />
                {patients.length} {patients.length === 1 ? "patient" : "patients"} in session
              </Badge>
              <Link href="/start">
                <Button className="rounded-xl" size="sm">
                  New check
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="med-slide-up med-stagger-1 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Walking checks", value: stats.total, icon: Users },
            { label: "Needs note", value: stats.needsNote, icon: FileText },
            { label: "Reviewed", value: stats.reviewed, icon: CheckCircle2 },
            { label: "Follow-up", value: stats.followUp, icon: Activity },
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
          <CardHeader className="border-b border-border/60 bg-card pb-4 space-y-3">
            <div>
              <CardTitle className="text-lg">Caseload</CardTitle>
              <p className="text-sm text-muted-foreground">
                Search a child, then open the packet. Needs note means no clinician note has been published yet.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by child name"
                  className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <select
                value={noteFilter}
                onChange={(event) => setNoteFilter(event.target.value as "all" | "needs_note" | "reviewed")}
                className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value="all">All notes</option>
                <option value="needs_note">Needs note</option>
                <option value="reviewed">Reviewed</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {patients.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 px-4 py-14 text-center">
                <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <FileSearch className="h-7 w-7" />
                </span>
                <div className="space-y-1">
                  <p className="text-base font-semibold">No walking checks yet</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Record the first 10-second clip. The child will appear here with a name, date, and note status.
                  </p>
                </div>
                <Link href="/start">
                  <Button size="lg" className="rounded-xl">
                    Record the first 10-second clip
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ) : visiblePatients.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                No children match that search.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40 text-xs text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Child</th>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">What we noticed</th>
                      <th className="px-4 py-3 font-semibold">Note</th>
                      <th className="px-4 py-3 font-semibold">Quality</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePatients.map((patient) => {
                      const badge = statusBadgeProps(patient.status);
                      const Icon = badge.Icon;
                      const concernBadge = CONCERN_BADGE_STYLES[toConcernLevel(patient.concernLevel)];
                      return (
                        <tr key={patient.id} className="border-b border-border/50 bg-card last:border-b-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-foreground">{patient.childName}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatAgeMonths(patient.ageMonths)}
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
                            <Badge variant="outline" className={`gap-1.5 text-[10px] ${patient.hasPublishedFeedback ? FOLLOWUP_BADGE_STYLES.routine : RUN_TONE_BADGE_STYLES.destructive}`}>
                              {patient.hasPublishedFeedback ? <CheckCircle2 className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                              {patient.hasPublishedFeedback ? "Reviewed" : "Needs note"}
                            </Badge>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              <Icon className="mr-1 inline h-3 w-3" />
                              {badge.label}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium capitalize">
                            {patient.qualityResult}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1.5">
                              <Link href={`/results/${patient.id}/clinician`}>
                                <Button size="sm" className="w-full gap-1.5 rounded-lg text-xs">
                                  <FileText className="h-3.5 w-3.5" />
                                  Open packet
                                </Button>
                              </Link>
                              <Link href={`/results/${patient.id}`}>
                                <Button size="sm" variant="outline" className="w-full gap-1.5 rounded-lg text-xs">
                                  Family view
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
    </div>
  );
}
