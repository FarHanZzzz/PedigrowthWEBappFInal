"use client";

import { AlertTriangle, CheckCircle2, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  classifyRunTone,
  getRunLabel,
  type RunProvenance,
} from "@/lib/session/runProvenance";
import { RUN_TONE_BADGE_STYLES } from "@/lib/presentation/severity";

interface Props {
  run: RunProvenance;
}

export default function RunProvenanceBadge({ run }: Props) {
  const tone = classifyRunTone(run.classification);
  const styles = RUN_TONE_BADGE_STYLES[tone];

  const Icon =
    run.classification === "real_analysis"
      ? CheckCircle2
      : run.classification === "demo_fixture"
        ? FlaskConical
        : AlertTriangle;

  return (
    <Badge variant="outline" className={`gap-1.5 px-2.5 py-1 text-[11px] font-semibold whitespace-normal ${styles}`}>
      <Icon className="h-3.5 w-3.5" />
      {getRunLabel(run.classification)}
    </Badge>
  );
}
