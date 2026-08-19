import type { ConcernLevel, FollowupPriority } from "@/lib/types";

export const CONCERN_LEVELS: ConcernLevel[] = ["none", "mild", "moderate", "significant"];
export const FOLLOWUP_PRIORITIES: FollowupPriority[] = ["routine", "earlier_review", "specialist"];

export function isConcernLevel(value: string): value is ConcernLevel {
  return CONCERN_LEVELS.includes(value as ConcernLevel);
}

export function toConcernLevel(value: string): ConcernLevel {
  return isConcernLevel(value) ? value : "none";
}

export function isFollowupPriority(value: string): value is FollowupPriority {
  return FOLLOWUP_PRIORITIES.includes(value as FollowupPriority);
}

export function toFollowupPriority(value: string): FollowupPriority {
  return isFollowupPriority(value) ? value : "routine";
}

export const CONCERN_LABELS: Record<ConcernLevel, string> = {
  none: "None observed",
  mild: "Mild observation",
  moderate: "Moderate concern",
  significant: "Significant concern",
};

export const CONCERN_PREFIX: Record<ConcernLevel, string> = {
  none: "Clear",
  mild: "Watch",
  moderate: "Action",
  significant: "Urgent",
};

export const CONCERN_BADGE_STYLES: Record<ConcernLevel, string> = {
  none: "border-emerald-300/60 bg-gradient-to-r from-emerald-50 to-emerald-100/50 text-emerald-800 shadow-sm shadow-emerald-100/50",
  mild: "border-amber-300/60 bg-gradient-to-r from-amber-50 to-amber-100/50 text-amber-900 shadow-sm shadow-amber-100/50",
  moderate: "border-orange-300/60 bg-gradient-to-r from-orange-50 to-orange-100/50 text-orange-900 shadow-sm shadow-orange-100/50",
  significant: "border-red-300/60 bg-gradient-to-r from-red-50 to-red-100/50 text-red-900 shadow-sm shadow-red-100/50",
};

export const FOLLOWUP_LABELS: Record<FollowupPriority, string> = {
  routine: "Routine Follow-Up",
  earlier_review: "Earlier Clinical Review",
  specialist: "Specialist Review Recommended",
};

export const FOLLOWUP_SHORT_LABELS: Record<FollowupPriority, string> = {
  routine: "Routine",
  earlier_review: "Earlier Review",
  specialist: "Specialist",
};

export const FOLLOWUP_BADGE_STYLES: Record<FollowupPriority, string> = {
  routine: "border-emerald-300/60 bg-gradient-to-r from-emerald-50 to-emerald-100/50 text-emerald-800 shadow-sm shadow-emerald-100/50",
  earlier_review: "border-orange-300/60 bg-gradient-to-r from-orange-50 to-orange-100/50 text-orange-900 shadow-sm shadow-orange-100/50",
  specialist: "border-red-300/60 bg-gradient-to-r from-red-50 to-red-100/50 text-red-900 shadow-sm shadow-red-100/50",
};

export const FOLLOWUP_CALLOUT_STYLES: Record<FollowupPriority, string> = {
  routine: "border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 to-emerald-100/40 text-emerald-900 shadow-sm shadow-emerald-100/50",
  earlier_review: "border-orange-300/60 bg-gradient-to-br from-orange-50/80 to-orange-100/40 text-orange-900 shadow-sm shadow-orange-100/50",
  specialist: "border-red-300/60 bg-gradient-to-br from-red-50/80 to-red-100/40 text-red-900 shadow-sm shadow-red-100/50",
};

export const FOLLOWUP_CALLOUT_TEXT: Record<FollowupPriority, string> = {
  routine: "No urgent escalation signal was detected in this clip.",
  earlier_review: "Clinical review should be scheduled sooner than routine follow-up.",
  specialist: "Escalate for specialist evaluation based on the observed concern pattern.",
};

export const CONCERN_HEX_COLORS: Record<ConcernLevel, string> = {
  none: "#0f766e",
  mild: "#a16207",
  moderate: "#b45309",
  significant: "#b91c1c",
};

export const RUN_TONE_BADGE_STYLES: Record<"success" | "warning" | "destructive", string> = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-800",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  destructive: "border-red-300 bg-error-container text-on-error-container",
};
