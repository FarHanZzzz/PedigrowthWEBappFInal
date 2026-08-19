import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Stethoscope, 
  Activity, 
  Clock, 
  Eye, 
  ListTodo, 
  MessageCircleQuestion, 
  ChevronRight 
} from "lucide-react";

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
  if (priority === "specialist") return "Needs Follow-up";
  if (priority === "earlier_review") return "Watch";
  return "On Track";
}

function timeframeFromPriority(priority: FollowupPriority): string {
  if (priority === "specialist") return "Suggested timeframe: as soon as possible";
  if (priority === "earlier_review") return "Suggested timeframe: within 2-4 weeks";
  return "Suggested timeframe: routine follow-up";
}

function statusBadgeClass(priority: FollowupPriority): string {
  if (priority === "specialist") return "border-red-300 bg-red-100/80 text-red-800 shadow-sm shadow-red-200/50";
  if (priority === "earlier_review") return "border-amber-300 bg-amber-100/80 text-amber-800 shadow-sm shadow-amber-200/50";
  return "border-emerald-300 bg-emerald-100/80 text-emerald-800 shadow-sm shadow-emerald-200/50";
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
      {/* Overall Summary Card */}
      <Card className="overflow-hidden border-blue-100 bg-gradient-to-br from-white/95 to-blue-50/80 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md">
        <div className="h-1 w-full bg-gradient-to-r from-blue-400 to-indigo-500" />
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Stethoscope className="h-5 w-5 text-blue-600" />
              Overall Summary
            </CardTitle>
            <Badge variant="outline" className={`font-semibold tracking-wide text-[10px] px-2 py-0.5 rounded-full ${statusBadgeClass(followupPriority)}`}>
              {statusLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-1 text-[15px] leading-relaxed text-foreground/90">
          <p className="font-medium text-foreground">{summaryText}</p>
          <p className="text-sm text-muted-foreground bg-card/60 p-3 rounded-lg border border-border/50">{followupSummary}</p>
        </CardContent>
      </Card>

      {/* Grid: Confidence & Follow Up */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/80 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
          <CardHeader className="pb-2 bg-surface-container-low/50">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Activity className="h-4 w-4 text-emerald-600" />
              Confidence Rating
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 text-sm text-muted-foreground leading-relaxed">
            <p>{confidenceText}</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
          <CardHeader className="pb-2 bg-surface-container-low/50">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Clock className="h-4 w-4 text-amber-600" />
              Follow-Up Priority
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-1 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground text-[15px]">{followupLabel}</p>
            <p className="text-muted-foreground">{timeframeFromPriority(followupPriority)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Specific Content Cards */}
      <Card className="border-indigo-100 bg-card shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <Eye className="h-5 w-5 text-indigo-500" />
            Key Observations
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-foreground/90 pt-2 pb-4">
          <div className="space-y-3">
            {observations.map((item) => (
              <div key={item} className="flex items-start gap-3 bg-surface-container-low/60 p-3 rounded-lg border border-border/50 transition-colors hover:bg-surface-container-low">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-primary">
                  <ChevronRight className="h-3.5 w-3.5 stroke-[3]" />
                </div>
                <p className="leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-100 bg-card shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <ListTodo className="h-5 w-5 text-emerald-500" />
            What To Do This Week
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-foreground/90 pt-2 pb-4">
          <div className="space-y-3">
            {nextWeekActions.map((item) => (
              <div key={item} className="flex items-start gap-3 bg-surface-container-low/60 p-3 rounded-lg border border-border/50 transition-colors hover:bg-surface-container-low">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <ChevronRight className="h-3.5 w-3.5 stroke-[3]" />
                </div>
                <p className="leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-teal-100 bg-card shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <MessageCircleQuestion className="h-5 w-5 text-teal-500" />
            Questions For Your Clinician
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-foreground/90 pt-2 pb-4">
          <div className="space-y-3">
            {clinicianQuestions.map((question) => (
              <div key={question} className="flex items-start gap-3 bg-surface-container-low/60 p-3 rounded-lg border border-border/50 transition-colors hover:bg-surface-container-low">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                  <ChevronRight className="h-3.5 w-3.5 stroke-[3]" />
                </div>
                <p className="leading-relaxed font-medium">{question}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
