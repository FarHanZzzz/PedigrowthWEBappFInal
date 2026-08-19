"use client";

import { cn } from "@/lib/utils";

const STEPS = [
  { n: 1, label: "Child" },
  { n: 2, label: "Record" },
  { n: 3, label: "Analyze" },
  { n: 4, label: "Results" },
] as const;

export function JourneyStepper({
  current,
  className,
}: {
  current: 1 | 2 | 3 | 4;
  className?: string;
}) {
  return (
    <ol className={cn("flex items-center gap-1", className)} aria-label="Walking check progress">
      {STEPS.map((step, index) => {
        const done = step.n < current;
        const active = step.n === current;
        return (
          <li key={step.n} className="flex min-w-0 flex-1 items-center gap-1">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                  done && "bg-primary text-primary-foreground",
                  active && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
              >
                {done ? "✓" : step.n}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <span
                className={cn(
                  "mb-4 h-px flex-1 rounded-full",
                  step.n < current ? "bg-primary/50" : "bg-border",
                )}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
