"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  ShieldCheck,
  ChevronRight,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { routeChild } from "@/lib/policy/routing-rules";
import { readSession, writeSession } from "@/lib/session/sessionStorage";
import type { AmbulatoryStatus } from "@/lib/types";

type WalkingAnswer = "yes" | "no" | "not_sure" | "";

function mapWalkingToAmbulatory(answer: WalkingAnswer): AmbulatoryStatus {
  switch (answer) {
    case "yes": return "independent";
    case "no": return "non_ambulant";
    case "not_sure": return "unknown";
    default: return "unknown";
  }
}

function readSavedSession(): {
  consent: boolean;
  ageMonths: string;
  walking: WalkingAnswer;
  nickname: string;
} {
  if (typeof window === "undefined") {
    return {
      consent: false,
      ageMonths: "",
      walking: "" as WalkingAnswer,
      nickname: "",
    };
  }

  const session = readSession<{
    consentTimestamp?: string;
    ageMonths?: number | string;
    walking?: WalkingAnswer;
    nickname?: string;
  }>();

  if (!session) {
    return {
      consent: false,
      ageMonths: "",
      walking: "" as WalkingAnswer,
      nickname: "",
    };
  }

  return {
    consent: Boolean(session.consentTimestamp),
    ageMonths: session.ageMonths ? session.ageMonths.toString() : "",
    walking: (session.walking as WalkingAnswer) || "",
    nickname:
      session.nickname && session.nickname !== "your child"
        ? session.nickname
        : "",
  };
}

export default function QuickGatePage() {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [ageMonths, setAgeMonths] = useState("");
  const [walking, setWalking] = useState<WalkingAnswer>("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const savedSession = readSavedSession();

    // Hydrate persisted intake state only after mount to keep SSR and first client render identical.
    if (
      !savedSession.consent &&
      savedSession.ageMonths === "" &&
      savedSession.walking === "" &&
      savedSession.nickname === ""
    ) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time hydration from session storage after mount.
    setConsent(savedSession.consent);
    setAgeMonths(savedSession.ageMonths);
    setWalking(savedSession.walking);
    setNickname(savedSession.nickname);
  }, []);

  const canProceed = consent && ageMonths.trim() !== "" && walking !== "";

  function handleStart() {
    setError("");

    const age = Number(ageMonths);
    if (isNaN(age) || age < 0 || age > 216) {
      setError("Please enter a valid age in months");
      return;
    }

    // Run routing — inline, no dedicated page
    const decision = routeChild({
      ageMonths: age,
      ambulatoryStatus: mapWalkingToAmbulatory(walking),
      caregiverIndicatesCannotWalk: walking === "no",
    });

    // Store minimal session data
    writeSession({
      nickname: nickname.trim() || "your child",
      ageMonths: age,
      walking,
      route: decision.route,
      routeReason: decision.reason,
      policyVersion: decision.policyVersion,
      consentTimestamp: new Date().toISOString(),
    });

    // Route silently — no intermediate routing page
    if (decision.route === "route_a") {
      router.push("/concern");
    } else {
      router.push("/capture");
    }
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-9rem)] items-center justify-center bg-surface-dim px-4 py-8 sm:px-6">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] right-[-5%] w-100 h-100 rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-75 h-75 rounded-full bg-accent/10 blur-[100px] pointer-events-none" />

      <div className="relative z-10 mx-auto w-full max-w-lg med-slide-up">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Intake Screening
          </p>
          <div className="inline-flex items-center justify-center rounded-2xl bg-primary/10 p-4 mb-4">
            <Heart className="h-8 w-8 text-primary" />
          </div>
          <h1 className="medical-title text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Before You Record
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-70 mx-auto">
            Share a few details so we can tailor the movement analysis properly.
          </p>
        </div>

        <Card className="medical-surface overflow-hidden rounded-3xl border-outline-variant/30 bg-surface">
          <CardContent className="space-y-6 p-6 sm:p-8">
            {/* Nickname — optional */}
            <div className="space-y-2">
              <Label htmlFor="nickname" className="text-sm font-semibold text-foreground/80">
                Child&apos;s name or nickname <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="nickname"
                placeholder="e.g., Alex"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="touch-target h-12 bg-surface-container/50 border-outline-variant/30 focus-visible:ring-accent rounded-xl"
                autoComplete="off"
              />
            </div>

            {/* Age — required */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="age" className="text-sm font-semibold text-foreground/80">
                  Age in months <span className="text-destructive">*</span>
                </Label>
                <span className="text-[10px] text-muted-foreground/70 font-medium">3yr=36 · 4yr=48 · 5yr=60</span>
              </div>
              <Input
                id="age"
                type="number"
                inputMode="numeric"
                min={0}
                max={216}
                placeholder="e.g., 36"
                value={ageMonths}
                onChange={(e) => { setAgeMonths(e.target.value); setError(""); }}
                className="touch-target h-12 bg-surface-container/50 border-outline-variant/30 focus-visible:ring-accent rounded-xl"
              />
            </div>

            {/* Walking — required */}
            <div className="space-y-3 pt-2">
              <Label className="text-sm font-semibold text-foreground/80">
                Which best describes them today? <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                {([
                  {
                    value: "yes" as const,
                    label: "Walks on own",
                    detail: "Independent",
                  },
                  {
                    value: "no" as const,
                    label: "Not walking",
                    detail: "Gets support",
                  },
                  {
                    value: "not_sure" as const,
                    label: "Not sure",
                    detail: "Mixed pattern",
                  },
                ]).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setWalking(option.value)}
                    className={`touch-target flex flex-col items-center justify-center rounded-xl border-2 p-3 text-center transition-all duration-200 ${
                      walking === option.value
                        ? "border-primary bg-primary/10 shadow-[0_4px_12px_rgba(2,128,144,0.15)] ring-2 ring-primary/20 ring-offset-1"
                        : "border-outline-variant/20 bg-surface-container-low hover:bg-surface-container hover:border-outline/30"
                    }`}
                  >
                    <span className={`text-xs font-bold ${walking === option.value ? 'text-primary' : 'text-foreground'}`}>
                      {option.label}
                    </span>
                    <span className="mt-1 text-[10px] sm:text-[9px] uppercase tracking-wider font-semibold text-muted-foreground/80">
                      {option.detail}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Consent */}
            <div className="flex items-start gap-4 rounded-xl bg-primary/5 p-4 border border-primary/10">
              <Checkbox
                id="consent"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                className="mt-0.5 size-5 min-w-5 rounded border-primary/40 data-[state=checked]:bg-primary"
              />
              <Label htmlFor="consent" className="text-xs leading-relaxed cursor-pointer text-muted-foreground font-medium">
                I understand Pedi-Growth is a screening support tool, not a diagnostic device. 
                Video is processed securely and is not stored unless explicitly saved.
              </Label>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-xs font-semibold text-destructive text-center">
                {error}
              </div>
            )}

            {/* Start button */}
            <Button
              onClick={handleStart}
              disabled={!canProceed}
              size="lg"
              className="touch-target w-full h-14 gap-2 text-base font-bold shadow-lg shadow-primary/25 rounded-xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none"
              id="quickgate-start"
            >
              {walking === "no" || walking === "not_sure" ? "Continue without video" : "Start Hardware Capture"}
              <ChevronRight className="h-5 w-5" />
            </Button>
          </CardContent>
        </Card>

        {/* Footer badges */}
        <div className="mt-6 flex items-center justify-center gap-6 text-[11px] font-semibold tracking-wide uppercase text-muted-foreground/60">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Locally Processed
          </span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/30"></span>
          <span className="flex items-center gap-1.5">
            <Play className="h-4 w-4" /> Web Real-Time
          </span>
        </div>
      </div>
    </div>
  );
}
