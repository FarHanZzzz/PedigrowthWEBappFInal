"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Clipboard, Copy, Printer, Stethoscope } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SharedPayload {
  caregiver: Record<string, unknown>;
  clinician: Record<string, unknown>;
  handoffText: string;
}

function asText(value: unknown, fallback = "Not provided"): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function formatDomainMap(value: unknown): Array<{ label: string; level: string }> {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const keys = ["asymmetry", "irregularRhythm", "lateralInstability", "pathDeviation"];
  const labels: Record<string, string> = {
    asymmetry: "Asymmetry",
    irregularRhythm: "Rhythm regularity",
    lateralInstability: "Lateral stability",
    pathDeviation: "Path deviation",
  };
  return keys
    .filter((key) => typeof record[key] === "string")
    .map((key) => ({
      label: labels[key] ?? key,
      level: String(record[key]),
    }));
}

export default function SharedPacketPage() {
  const params = useParams();
  const token = String(params.token ?? "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<SharedPayload | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!token) {
        if (active) {
          setError("Missing share token.");
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`/api/share/${token}`, { method: "GET" });
        const body = (await response.json()) as {
          error?: string;
          payload?: SharedPayload;
        };

        if (!response.ok || !body.payload) {
          throw new Error(body.error ?? "Unable to load shared packet.");
        }

        if (!active) return;
        setPayload(body.payload);
        setLoading(false);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Unable to load shared packet.";
        setError(message);
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [token]);

  async function copyHandoff() {
    if (!payload?.handoffText) return;
    try {
      await navigator.clipboard.writeText(payload.handoffText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const clinician = payload?.clinician ?? {};
  const caregiver = payload?.caregiver ?? {};
  const profile = (clinician.profileSummary ?? {}) as Record<string, unknown>;
  const quality = (clinician.qualitySummary ?? {}) as Record<string, unknown>;
  const domains = formatDomainMap(clinician.concernDomains);
  const questions = asList(caregiver.clinicianQuestions);
  const nickname = asText(profile.nickname, "Child");
  const analyzedAt = asText(profile.analyzedAt, "");

  const qualityNotes = useMemo(() => {
    const notes = asText(quality.confidenceNotes, "");
    const failures = asList(quality.failureReasons);
    const borderline = asList(quality.borderlineReasons);
    return { notes, failures, borderline };
  }, [quality]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading shared packet…</p>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg items-center">
        <Card className="w-full border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Share link unavailable
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{error ?? "Unknown error."}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 print:max-w-none">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            <Stethoscope className="h-3.5 w-3.5" />
            Pedi-Growth clinician handoff
          </div>
          <h1 className="medical-title text-3xl font-semibold">Walking check for {nickname}</h1>
          <p className="text-sm text-muted-foreground">
            Observational screening packet. This is not a diagnosis.
            {analyzedAt ? ` Recorded ${new Date(analyzedAt).toLocaleString()}.` : ""}
          </p>
        </div>
        <div className="print:hidden flex gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={copyHandoff}>
            {copied ? <Clipboard className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy note"}
          </Button>
        </div>
      </header>

      <Card className="medical-surface">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Family summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>{asText(caregiver.observationsText)}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">How sure we are</p>
              <p className="mt-1">{asText(caregiver.confidenceText)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Suggested follow-up</p>
              <p className="mt-1">{asText(caregiver.professionalEvalGuidance)}</p>
            </div>
          </div>
          {questions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Questions for the visit</p>
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                {questions.slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="medical-surface">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Clinician snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>{asText(clinician.structuredNotes)}</p>
          {domains.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {domains.map((domain) => (
                <Badge key={domain.label} variant="outline" className="capitalize">
                  {domain.label}: {domain.level}
                </Badge>
              ))}
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground">Quality</p>
            <p className="mt-1">{qualityNotes.notes || "No additional quality note."}</p>
            {qualityNotes.failures.length > 0 && (
              <p className="mt-1 text-destructive">Limits: {qualityNotes.failures.join(" ")}</p>
            )}
            {qualityNotes.borderline.length > 0 && (
              <p className="mt-1 text-muted-foreground">Caution: {qualityNotes.borderline.join(" ")}</p>
            )}
          </div>
          {asText(caregiver.limitationsText, "") && (
            <p className="text-xs text-muted-foreground">{asText(caregiver.limitationsText)}</p>
          )}
        </CardContent>
      </Card>

      <Card className="medical-surface print:break-inside-avoid">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Paste-ready handoff</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap rounded-xl bg-muted/50 p-4 text-sm leading-relaxed">
            {payload.handoffText}
          </p>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Pedi-Growth documents one walking clip for a clinician conversation. It does not diagnose a medical condition.
      </p>
    </div>
  );
}
