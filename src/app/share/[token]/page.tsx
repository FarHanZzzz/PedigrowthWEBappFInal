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
      <div className="min-h-dvh flex items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Loading shared packet...</p>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <Card className="max-w-lg w-full border-red-200 bg-red-50/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-red-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Share link unavailable
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-red-800">{error ?? "Unknown error."}</CardContent>
        </Card>
      </div>
    );
  }

  const caregiver = payload.caregiver;
  const clinician = payload.clinician;

  return (
    <div className="min-h-dvh bg-linear-to-b from-background to-muted/30 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" />
            Shared clinician handoff packet
          </div>
          <h1 className="text-2xl font-bold">GAITBRIDGE Shared Packet</h1>
          <p className="text-sm text-muted-foreground">
            Observational gait documentation support. This shared report is non-diagnostic and intended for follow-up discussion.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Caregiver Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p><strong>Observation:</strong> {String(caregiver.observationsText ?? "Not provided")}</p>
            <p><strong>Confidence:</strong> {String(caregiver.confidenceText ?? "Not provided")}</p>
            <p><strong>Limitations:</strong> {String(caregiver.limitationsText ?? "Not provided")}</p>
            <p><strong>Follow-up:</strong> {String(caregiver.professionalEvalGuidance ?? "Not provided")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Clinician Packet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p><strong>Structured notes:</strong> {String(clinician.structuredNotes ?? "Not provided")}</p>
            <p><strong>Quality summary:</strong> {JSON.stringify(clinician.qualitySummary ?? {}, null, 2)}</p>
            <p><strong>Concern domains:</strong> {JSON.stringify(clinician.concernDomains ?? {}, null, 2)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Handoff Text</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              {payload.handoffText}
            </pre>
            <Button variant="outline" className="gap-2 text-xs" onClick={copyHandoff}>
              {copied ? <Clipboard className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy handoff text"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
