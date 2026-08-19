"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Clipboard, Copy, FileText, Link2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SharedPayload {
  caregiver: Record<string, unknown>;
  clinician: Record<string, unknown>;
  handoffText: string;
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

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading shared packet...</p>
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

  const caregiver = payload.caregiver;
  const clinician = payload.clinician;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-2 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" />
          Shared clinician packet
        </div>
        <h1 className="medical-title text-3xl font-semibold">Pedi-Growth shared packet</h1>
        <p className="text-sm text-muted-foreground">
          Observational walking documentation. This shared report is not a diagnosis and is meant for follow-up discussion.
        </p>
      </div>

      <Card className="medical-surface">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Family summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><strong className="text-foreground">Observation:</strong> {String(caregiver.observationsText ?? "Not provided")}</p>
          <p><strong className="text-foreground">Confidence:</strong> {String(caregiver.confidenceText ?? "Not provided")}</p>
          <p><strong className="text-foreground">Limitations:</strong> {String(caregiver.limitationsText ?? "Not provided")}</p>
          <p><strong className="text-foreground">Follow-up:</strong> {String(caregiver.professionalEvalGuidance ?? "Not provided")}</p>
        </CardContent>
      </Card>

      <Card className="medical-surface">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Clinician packet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><strong className="text-foreground">Structured notes:</strong> {String(clinician.structuredNotes ?? "Not provided")}</p>
          <p><strong className="text-foreground">Quality summary:</strong> {JSON.stringify(clinician.qualitySummary ?? {}, null, 2)}</p>
          <p><strong className="text-foreground">Concern domains:</strong> {JSON.stringify(clinician.concernDomains ?? {}, null, 2)}</p>
        </CardContent>
      </Card>

      <Card className="medical-surface">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Handoff text</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="whitespace-pre-wrap rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            {payload.handoffText}
          </pre>
          <Button variant="outline" className="rounded-xl" onClick={copyHandoff}>
            {copied ? <Clipboard className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy handoff text"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
