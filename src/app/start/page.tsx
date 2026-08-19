"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { JourneyStepper } from "@/components/layout/JourneyStepper";
import { monthsFromYearsAndMonths } from "@/lib/presentation/age";
import { routeChild } from "@/lib/policy/routing-rules";
import { readSession, writeSession } from "@/lib/session/sessionStorage";
import type { AmbulatoryStatus } from "@/lib/types";

type WalkingAnswer = "yes" | "no" | "not_sure" | "";

function mapWalkingToAmbulatory(answer: WalkingAnswer): AmbulatoryStatus {
  switch (answer) {
    case "yes":
      return "independent";
    case "no":
      return "non_ambulant";
    case "not_sure":
      return "unknown";
    default:
      return "unknown";
  }
}

export default function QuickGatePage() {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [years, setYears] = useState("");
  const [months, setMonths] = useState("");
  const [walking, setWalking] = useState<WalkingAnswer>("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const session = readSession<{
      consentTimestamp?: string;
      ageMonths?: number | string;
      walking?: WalkingAnswer;
      nickname?: string;
    }>();
    if (!session) return;

    if (session.consentTimestamp) setConsent(true);
    if (session.walking) setWalking(session.walking);
    if (session.nickname && session.nickname !== "your child") setNickname(session.nickname);

    const age = Number(session.ageMonths);
    if (Number.isFinite(age) && age >= 0) {
      setYears(String(Math.floor(age / 12)));
      setMonths(String(Math.round(age % 12)));
    }
  }, []);

  const ageMonths = monthsFromYearsAndMonths(years, months);
  const canProceed = consent && ageMonths !== null && walking !== "";

  function handleStart() {
    setError("");
    const age = monthsFromYearsAndMonths(years, months);
    if (age === null) {
      setError("Enter age as years and months (months 0–11).");
      return;
    }

    const decision = routeChild({
      ageMonths: age,
      ambulatoryStatus: mapWalkingToAmbulatory(walking),
      caregiverIndicatesCannotWalk: walking === "no",
    });

    writeSession({
      nickname: nickname.trim() || "your child",
      ageMonths: age,
      walking,
      route: decision.route,
      routeReason: decision.reason,
      policyVersion: decision.policyVersion,
      consentTimestamp: new Date().toISOString(),
    });

    if (decision.route === "route_a") {
      router.push("/concern");
    } else {
      router.push("/capture");
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 py-2">
      <JourneyStepper current={1} />

      <div className="text-center">
        <h1 className="medical-title text-2xl font-semibold tracking-tight sm:text-3xl">
          About your child
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          A few details so we know whether a walking video is the right next step.
        </p>
      </div>

      <Card className="medical-surface border-border/70">
        <CardContent className="space-y-6 p-5 sm:p-7">
          <div className="space-y-2">
            <Label htmlFor="nickname">Name or nickname (optional)</Label>
            <Input
              id="nickname"
              placeholder="e.g. Alex"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="h-12 rounded-xl"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label>
              Age <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Input
                  id="years"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={18}
                  placeholder="Years"
                  value={years}
                  onChange={(e) => {
                    setYears(e.target.value);
                    setError("");
                  }}
                  className="h-12 rounded-xl"
                />
                <p className="text-xs text-muted-foreground">Years</p>
              </div>
              <div className="space-y-1.5">
                <Input
                  id="months"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={11}
                  placeholder="Months"
                  value={months}
                  onChange={(e) => {
                    setMonths(e.target.value);
                    setError("");
                  }}
                  className="h-12 rounded-xl"
                />
                <p className="text-xs text-muted-foreground">Months (0–11)</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label>
              How do they get around today? <span className="text-destructive">*</span>
            </Label>
            <div className="grid gap-2">
              {(
                [
                  { value: "yes" as const, label: "Walks on their own", detail: "A walking video is useful" },
                  { value: "no" as const, label: "Not walking independently", detail: "We’ll skip the video and capture concerns" },
                  { value: "not_sure" as const, label: "Not sure", detail: "We’ll route based on age and notes" },
                ]
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setWalking(option.value)}
                  className={`min-h-14 rounded-xl border px-4 py-3 text-left transition-colors ${
                    walking === option.value
                      ? "border-primary bg-primary/8 ring-2 ring-primary/15"
                      : "border-border bg-card hover:bg-muted/40"
                  }`}
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.detail}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-4">
            <Checkbox
              id="consent"
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              className="mt-0.5 size-5"
            />
            <Label htmlFor="consent" className="cursor-pointer text-sm leading-relaxed font-normal text-muted-foreground">
              I understand this is a screening support tool, not a diagnosis, and should be reviewed with a clinician.
            </Label>
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>
          )}

          <Button
            onClick={handleStart}
            disabled={!canProceed}
            size="lg"
            className="h-12 w-full rounded-xl text-base font-semibold"
            id="quickgate-start"
          >
            {walking === "no" || walking === "not_sure" ? "Continue" : "Continue to recording"}
            <ChevronRight className="h-5 w-5" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
