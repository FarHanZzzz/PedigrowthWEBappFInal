"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  MessageCircle,
  ArrowRight,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { readResultRaw, writeResult } from "@/lib/session/sessionStorage";

/**
 * Follow-up question rules (deterministic, not AI-driven):
 *
 * Questions are selected based on which concerns were detected.
 * Each question maps to a confidence/priority/handoff improvement category.
 */

interface FollowUpQuestion {
  id: string;
  question: string;
  type: "select" | "boolean" | "text";
  options?: { value: string; label: string }[];
  triggerConcerns: string[]; // which concerns trigger this question
  improvesCategory: "confidence" | "priority" | "handoff";
}

const FOLLOW_UP_POOL: FollowUpQuestion[] = [
  {
    id: "new_or_persistent",
    question: "Is this walking pattern new, or has it been like this for a while?",
    type: "select",
    options: [
      { value: "new", label: "New — started recently" },
      { value: "persistent", label: "Been like this for a while" },
      { value: "worsening", label: "Getting worse over time" },
      { value: "unsure", label: "Not sure" },
    ],
    triggerConcerns: ["asymmetry", "irregularRhythm", "lateralInstability", "pathDeviation"],
    improvesCategory: "priority",
  },
  {
    id: "bilateral",
    question: "Does this affect both sides equally, or more on one side?",
    type: "select",
    options: [
      { value: "both_equal", label: "Both sides equally" },
      { value: "left_more", label: "Left side more" },
      { value: "right_more", label: "Right side more" },
      { value: "unsure", label: "Not sure" },
    ],
    triggerConcerns: ["asymmetry"],
    improvesCategory: "confidence",
  },
  {
    id: "falls",
    question: "How often does your child fall?",
    type: "select",
    options: [
      { value: "rarely", label: "Rarely or never" },
      { value: "sometimes", label: "A few times a month" },
      { value: "weekly", label: "Weekly" },
      { value: "daily", label: "Daily or almost daily" },
    ],
    triggerConcerns: ["asymmetry", "lateralInstability", "pathDeviation"],
    improvesCategory: "priority",
  },
  {
    id: "fatigue",
    question: "Does walking quality change with fatigue or distance?",
    type: "select",
    options: [
      { value: "no_change", label: "Stays the same" },
      { value: "worse_distance", label: "Gets worse with longer distances" },
      { value: "worse_fatigue", label: "Gets worse when tired" },
      { value: "unsure", label: "Not sure" },
    ],
    triggerConcerns: ["irregularRhythm", "lateralInstability"],
    improvesCategory: "confidence",
  },
  {
    id: "orthotics",
    question: "Does your child use any orthotics, braces, or shoe inserts?",
    type: "boolean",
    triggerConcerns: ["asymmetry", "lateralInstability", "pathDeviation"],
    improvesCategory: "handoff",
  },
  {
    id: "diagnosis",
    question: "Has a diagnosis been discussed with your child's healthcare team?",
    type: "select",
    options: [
      { value: "none", label: "No diagnosis discussed" },
      { value: "suspected", label: "A condition is suspected" },
      { value: "diagnosed", label: "A diagnosed condition exists" },
      { value: "prefer_not", label: "Prefer not to say" },
    ],
    triggerConcerns: ["asymmetry", "irregularRhythm", "lateralInstability", "pathDeviation"],
    improvesCategory: "handoff",
  },
  {
    id: "concern_text",
    question: "Anything else you'd like to note about your child's walking?",
    type: "text",
    triggerConcerns: ["asymmetry", "irregularRhythm", "lateralInstability", "pathDeviation"],
    improvesCategory: "handoff",
  },
];

export default function RefinePage() {
  const router = useRouter();
  const params = useParams();
  const resultId = params.id as string;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [boolAnswers, setBoolAnswers] = useState<Record<string, boolean>>({});

  const resultData = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = readResultRaw(resultId);
    if (!raw) return null;
    return JSON.parse(raw) as {
      concerns: {
        asymmetry: string;
        irregularRhythm: string;
        lateralInstability: string;
        pathDeviation: string;
        qualityWarning?: boolean;
        isLimited?: boolean;
      };
      quality?: {
        cameraAngle?: string;
      };
    };
  }, [resultId]);

  useEffect(() => {
    if (!resultData) {
      router.replace("/start");
    }
  }, [resultData, router]);

  const questions = useMemo(() => {
    const concerns = resultData?.concerns;
    if (!concerns) return [];

    const activeConcerns: string[] = [];
    if (concerns.asymmetry !== "none") activeConcerns.push("asymmetry");
    if (concerns.irregularRhythm !== "none") activeConcerns.push("irregularRhythm");
    if (concerns.lateralInstability !== "none") activeConcerns.push("lateralInstability");
    if (concerns.pathDeviation !== "none") activeConcerns.push("pathDeviation");

    const isLowConfidence = concerns.qualityWarning || (concerns.isLimited ?? false);

    let applicable = FOLLOW_UP_POOL.filter((question) =>
      question.triggerConcerns.some((trigger) => activeConcerns.includes(trigger))
    );

    if (isLowConfidence && applicable.length === 0) {
      applicable = FOLLOW_UP_POOL.filter(
        (question) =>
          question.improvesCategory === "handoff" || question.id === "new_or_persistent"
      );
    }

    return applicable.slice(0, 6);
  }, [resultData]);

  const showSideViewSuggestion = useMemo(() => {
    const quality = resultData?.quality as { cameraAngle?: string } | undefined;
    return quality?.cameraAngle === "frontal";
  }, [resultData]);

  function handleSubmit() {
    // Store refinement data
    const refinement = {
      answers,
      boolAnswers,
      refinedAt: new Date().toISOString(),
    };

    // Update the result with refinement context
    const raw =
      readResultRaw(resultId);
    if (raw) {
      const result = JSON.parse(raw);
      result.refinement = refinement;
      writeResult(resultId, result);
    }

    // Back to results with refined context
    router.push(`/results/${resultId}`);
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="clinical-layer mb-5 rounded-[1.8rem] px-6 py-7 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container-lowest">
            <MessageCircle className="h-6 w-6 text-primary" />
          </div>
          <h1 data-display="true" className="text-3xl font-semibold text-foreground">
            A few follow-up details
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            These improve the accuracy and usefulness of your report.
            All are optional.
          </p>
        </div>

        <div className="space-y-4">
          {/* Side-view suggestion */}
          {showSideViewSuggestion && (
            <Card className="bg-secondary-container/65">
              <CardContent className="p-4 text-xs">
                <p className="font-medium text-secondary-foreground mb-1">
                  Optional: A side-view recording can unlock additional metrics
                </p>
                <p className="text-secondary-foreground/80">
                  Side-view video enables analysis of knee angles, ankle angles,
                  and trunk lean. This is optional — your front-view assessment
                  is already complete.
                </p>
              </CardContent>
            </Card>
          )}

          {questions.map((q) => (
            <Card key={q.id}>
              <CardContent className="p-4">
                <Label className="text-sm font-medium leading-snug">
                  {q.question}
                </Label>

                <div className="mt-2.5">
                  {q.type === "select" && q.options && (
                    <Select
                      value={answers[q.id] ?? ""}
                      onValueChange={(v: string | null) => { if (v) setAnswers((p) => ({ ...p, [q.id]: v })); }}
                    >
                      <SelectTrigger className="touch-target">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {q.options.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {q.type === "boolean" && (
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { val: true, label: "Yes" },
                        { val: false, label: "No" },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => setBoolAnswers((p) => ({ ...p, [q.id]: opt.val }))}
                          className={`touch-target rounded-2xl border border-transparent p-2.5 text-sm font-medium transition-all ${
                            boolAnswers[q.id] === opt.val
                              ? "bg-secondary-container text-secondary-foreground"
                              : "bg-surface-container-low hover:bg-surface-variant"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {q.type === "text" && (
                    <Textarea
                      placeholder="Optional notes..."
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                      rows={3}
                      maxLength={500}
                    />
                  )}
                </div>

                {/* Category tag */}
                <div className="mt-2 text-[10px] text-muted-foreground/50">
                  Improves: {q.improvesCategory === "confidence" ? "measurement accuracy" : q.improvesCategory === "priority" ? "follow-up guidance" : "clinician report"}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Info */}
        <div className="mt-4 flex gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            These details are optional. Your results are already available without them.
            Providing context helps us give better follow-up guidance and clinician reports.
          </span>
        </div>

        {/* Actions */}
        <div className="mt-4 space-y-3">
          <Button
            onClick={handleSubmit}
            size="lg"
            className="touch-target w-full gap-2 text-base font-semibold"
            id="refine-submit"
          >
            Update Report
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={() => router.push(`/results/${resultId}`)}
          >
            Back to results (skip)
          </Button>
        </div>
      </div>
    </div>
  );
}
