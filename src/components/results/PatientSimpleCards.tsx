import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListTodo, MessageCircleQuestion } from "lucide-react";

type FollowupPriority = "routine" | "earlier_review" | "specialist";

interface PatientSimpleCardsProps {
  summaryText: string;
  confidenceText: string;
  observations: string[];
  nextWeekActions: string[];
  followupLabel: string;
  followupSummary: string;
  followupPriority: FollowupPriority;
  clinicianQuestions: string[];
}

function statusFromPriority(priority: FollowupPriority): string {
  if (priority === "specialist") return "Needs follow-up";
  if (priority === "earlier_review") return "Watch";
  return "On track";
}

function statusBadgeClass(priority: FollowupPriority): string {
  if (priority === "specialist") return "border-red-200 bg-red-50 text-red-800";
  if (priority === "earlier_review") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

export default function PatientSimpleCards({
  summaryText,
  confidenceText,
  observations,
  nextWeekActions,
  followupLabel,
  followupSummary,
  followupPriority,
  clinicianQuestions,
}: PatientSimpleCardsProps) {
  const statusLabel = statusFromPriority(followupPriority);

  return (
    <section className="space-y-4">
      <Card className="medical-surface">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg">What to do next</CardTitle>
            <Badge variant="outline" className={statusBadgeClass(followupPriority)}>
              {statusLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-[15px] leading-relaxed">
          <p>{summaryText}</p>
          <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">{followupSummary}</p>
          <p className="text-xs text-muted-foreground">{confidenceText}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="medical-surface">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">This week</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {nextWeekActions.map((item) => (
                <li key={item} className="flex gap-2">
                  <ListTodo className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="medical-surface">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ask the clinician</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {clinicianQuestions.map((item) => (
                <li key={item} className="flex gap-2">
                  <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {observations.length > 0 && (
        <Card className="medical-surface">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">What stood out</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {observations.map((item) => (
              <p key={item}>{item}</p>
            ))}
            <p className="text-xs">{followupLabel}</p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
