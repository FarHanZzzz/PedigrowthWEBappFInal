"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  collectResultIds,
  readResultRaw,
  readSession,
} from "@/lib/session/sessionStorage";

const AssistantPanel = dynamic(() => import("@/components/results/AssistantPanel"), {
  ssr: false,
  loading: () => null,
});

type RiskCategory = "high" | "moderate" | "low" | "unknown";

type AssistantMetrics = {
  step_length?: number;
  symmetry_index?: number;
  [key: string]: number | undefined;
};

type AssistantContext = {
  summary?: string;
  confidence_notes?: string;
  followup_priority?: string;
  assessed_domains?: string[];
  retake_suggestions?: string[];
  quality_result?: string;
};

type ParsedResultLike = {
  concerns?: {
    overallLevel?: string;
    followupPriority?: string;
    assessedDomains?: string[];
  };
  quality?: {
    confidenceNotes?: string;
    retakeSuggestions?: string[];
    result?: string;
  };
  features?: {
    stepLength?: { value?: number };
    stepSymmetry?: { value?: number };
    cadence?: { value?: number };
    frontalAsymmetry?: { value?: number };
    strideRegularity?: { value?: number };
    pathDeviation?: { value?: number };
    baseOfSupport?: { value?: number };
  };
  reports?: {
    caregiver?: {
      observationsText?: string;
    };
  };
};

function deriveRiskCategory(level?: string): RiskCategory {
  const normalized = (level ?? "").toLowerCase();
  if (normalized === "significant") return "high";
  if (normalized === "moderate") return "moderate";
  if (normalized === "mild" || normalized === "none") return "low";
  return "unknown";
}

function extractResultIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/results\/([^/]+)/);
  return match?.[1] ?? null;
}

function rankResultId(id: string): number {
  if (!id.startsWith("r_")) return 0;
  const parsed = Number.parseInt(id.slice(2), 36);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestResultIdFromSession(): string | null {
  if (typeof window === "undefined") return null;
  const ids = collectResultIds(window.sessionStorage);
  if (ids.length === 0) return null;
  const sorted = [...ids].sort((a, b) => rankResultId(b) - rankResultId(a));
  return sorted[0] ?? null;
}

function shouldRenderDock(pathname: string): boolean {
  if (pathname === "/") return false;
  if (/^\/results\/[^/]+$/.test(pathname)) return false;
  return true;
}

export default function GlobalAssistantDock() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const enabled = useMemo(() => shouldRenderDock(pathname), [pathname]);

  const assistantData = useMemo(() => {
    const fallback = {
      resultId: undefined as string | undefined,
      metrics: undefined as AssistantMetrics | undefined,
      riskCategory: "unknown" as RiskCategory,
      context: {
        summary:
          "Ask for plain-language guidance, confidence interpretation, and next-step planning.",
      } as AssistantContext,
    };

    if (!enabled || typeof window === "undefined") {
      return fallback;
    }

    const session = readSession<Record<string, unknown>>();
    const genericSummary =
      typeof session?.nickname === "string"
        ? `Session for ${session.nickname}. Ask for plain-language guidance and next steps.`
        : fallback.context.summary;

    const resolvedId =
      extractResultIdFromPathname(pathname) ?? latestResultIdFromSession() ?? undefined;

    if (!resolvedId) {
      return {
        ...fallback,
        context: { summary: genericSummary },
      };
    }

    const raw = readResultRaw(resolvedId);
    if (!raw) {
      return {
        ...fallback,
        resultId: resolvedId,
        context: { summary: genericSummary },
      };
    }

    try {
      const parsed = JSON.parse(raw) as ParsedResultLike;

      return {
        resultId: resolvedId,
        riskCategory: deriveRiskCategory(parsed.concerns?.overallLevel),
        metrics: {
          step_length: parsed.features?.stepLength?.value,
          symmetry_index: parsed.features?.stepSymmetry?.value,
          cadence: parsed.features?.cadence?.value,
          frontal_asymmetry: parsed.features?.frontalAsymmetry?.value,
          stride_regularity: parsed.features?.strideRegularity?.value,
          path_deviation: parsed.features?.pathDeviation?.value,
          base_of_support: parsed.features?.baseOfSupport?.value,
        },
        context: {
          summary: parsed.reports?.caregiver?.observationsText ?? genericSummary,
          confidence_notes: parsed.quality?.confidenceNotes,
          followup_priority: parsed.concerns?.followupPriority,
          assessed_domains: parsed.concerns?.assessedDomains,
          retake_suggestions: parsed.quality?.retakeSuggestions,
          quality_result: parsed.quality?.result,
        },
      };
    } catch {
      return {
        ...fallback,
        resultId: resolvedId,
        context: { summary: genericSummary },
      };
    }
  }, [enabled, pathname]);

  if (!enabled) return null;

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-[55] bg-background/50 print:hidden"
          aria-label="Close assistant"
          onClick={() => setIsOpen(false)}
        />
      )}
      <div className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-end gap-3 print:hidden md:inset-x-auto md:right-5 md:bottom-5">
        {isOpen && (
          <div
            id="global-ai-assistant-panel"
            className="h-[min(34rem,calc(100dvh-9rem))] w-full max-w-[26rem] overflow-hidden md:w-[26rem]"
          >
            <AssistantPanel
              resultId={assistantData.resultId}
              metrics={assistantData.metrics}
              risk_category={assistantData.riskCategory}
              context={assistantData.context}
              isOpen={isOpen}
              onToggle={() => setIsOpen(false)}
            />
          </div>
        )}

        <Button
          id="global-assistant-toggle-button"
          size="lg"
          onClick={() => setIsOpen((prev) => !prev)}
          className="h-14 rounded-full px-5 shadow-lg"
          aria-expanded={isOpen}
          aria-controls="global-ai-assistant-panel"
        >
          {isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
          {isOpen ? "Close" : "Ask AI"}
        </Button>
      </div>
    </>
  );
}
