// PEDI-GROWTH — GMFCS Level Classification Card
// ====================================================================
// Interactive GMFCS level selector for the clinician handoff packet.
// This is a CLINICIAN tool — the clinician selects the level based on
// their clinical judgment. The system does NOT auto-classify GMFCS.
//
// IMPORTANT: GMFCS classification requires clinical training.
// This card provides the standard definitions as a reference tool.
// ====================================================================

"use client";

import { useState } from "react";
import { CheckCircle2, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GMFCS_LEVELS, type GMFCSLevel } from "@/lib/clinical/frameworks";

interface GMFCSCardProps {
  /** Callback when a GMFCS level is selected */
  onLevelSelect?: (level: number | null) => void;
  /** Pre-selected level (e.g., from session) */
  initialLevel?: number | null;
  /** Whether to allow selection (false = display-only mode) */
  interactive?: boolean;
}

/**
 * GMFCSCard — Renders the 5 GMFCS levels as selectable cards.
 * Used in the clinician handoff packet for standardized documentation.
 */
export default function GMFCSCard({
  onLevelSelect,
  initialLevel = null,
  interactive = true,
}: GMFCSCardProps) {
  const [selectedLevel, setSelectedLevel] = useState<number | null>(initialLevel);

  function handleSelect(level: GMFCSLevel) {
    if (!interactive) return;

    const newLevel = selectedLevel === level.level ? null : level.level;
    setSelectedLevel(newLevel);
    onLevelSelect?.(newLevel);
  }

  return (
    <Card className="print-section">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-bold">
          <Info className="h-4 w-4" />
          Standardized Scale: GMFCS Classification
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1 font-medium">
          Gross Motor Function Classification System (Palisano et al., 1997; revised 2007).
          {interactive
            ? " Select the level that best matches your clinical assessment."
            : " Clinician-documented classification."}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {GMFCS_LEVELS.map((level) => {
          const isSelected = selectedLevel === level.level;

          return (
            <button
              key={level.level}
              type="button"
              onClick={() => handleSelect(level)}
              disabled={!interactive}
              className={`
                w-full text-left rounded-lg border p-3 transition-all duration-200
                ${isSelected
                  ? `${level.colorClass} ring-2 ring-primary/30 shadow-sm`
                  : "bg-muted/20 hover:bg-muted/40 border-border/60"
                }
                ${interactive ? "cursor-pointer" : "cursor-default"}
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${isSelected ? level.colorClass : ""}`}
                    >
                      Level {level.level}
                    </Badge>
                    <span className="text-sm font-bold text-foreground">
                      {level.title.replace(`Level ${level.level} — `, "")}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed font-medium">
                    {level.description}
                  </p>
                  <p className="mt-1.5 text-[12px] font-semibold text-foreground/70">
                    → {level.functionalSummary}
                  </p>
                </div>
                {isSelected && (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                )}
              </div>
            </button>
          );
        })}

        {/* Non-diagnostic disclaimer */}
        <div className="rounded-lg bg-surface-container-low p-2.5 text-[11px] text-muted-foreground text-center mt-3">
          GMFCS classification requires trained clinical judgment. This tool provides standard
          definitions as a reference for documentation purposes only.
        </div>
      </CardContent>
    </Card>
  );
}
