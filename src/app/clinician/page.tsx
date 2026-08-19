import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  FileText,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Clinician workspace — Pedi-Growth",
  description: "Open a caseload, review walking-check packets, and send a follow-up note.",
};

export default function ClinicianEntryPage() {
  return (
    <div className="w-full space-y-8">
      <div>
        <p className="text-sm font-medium text-primary">Clinician workspace</p>
        <h1 className="medical-title mt-2 text-3xl font-semibold leading-tight sm:text-4xl">
          Review walking checks without wading through a demo portal.
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
          Open saved packets, watch the annotated clip, and leave a note the family can see. This is structured screening support — not a diagnostic device.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/portal/clinician" className="w-full sm:w-auto">
          <Button size="lg" className="h-12 w-full rounded-xl">
            <Users className="h-4 w-4" />
            Open caseload
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <Link href="/history" className="w-full sm:w-auto">
          <Button variant="outline" size="lg" className="h-12 w-full rounded-xl">
            <ClipboardList className="h-4 w-4" />
            Browse saved checks
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: FileText,
            title: "Read the packet",
            body: "Concern domains, quality notes, and a handoff summary on one page.",
          },
          {
            icon: Stethoscope,
            title: "Leave a note",
            body: "Publish follow-up guidance the family sees on their result.",
          },
          {
            icon: ShieldCheck,
            title: "Stay non-diagnostic",
            body: "Language stays observational so the visit conversation stays yours.",
          },
        ].map((item) => (
          <div key={item.title} className="medical-surface p-5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <item.icon className="h-5 w-5" />
            </span>
            <h2 className="mt-3 text-base font-semibold">{item.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Families start at the home screen. This door is for clinicians who already have a packet or caseload to review.
      </p>
    </div>
  );
}
