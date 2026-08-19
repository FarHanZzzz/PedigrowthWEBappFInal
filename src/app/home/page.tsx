import Link from "next/link";
import { ArrowRight, Play, ShieldCheck, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Pedi-Growth — How it works",
  description: "A walking check for families and a structured packet for clinicians.",
};

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 py-6">
      <div>
        <p className="text-sm font-medium text-primary">How Pedi-Growth works</p>
        <h1 className="medical-title mt-2 text-3xl font-semibold leading-tight sm:text-4xl">
          From a phone video to a clinician-ready summary.
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Families record one front-view walking clip. The app measures movement on the device, then prepares a calm summary and a packet for follow-up. It does not diagnose.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/start" className="w-full sm:w-auto">
          <Button size="lg" className="h-12 w-full rounded-xl">
            <Play className="h-4 w-4" />
            Start a walking check
          </Button>
        </Link>
        <Link href="/portal/clinician" className="w-full sm:w-auto">
          <Button variant="outline" size="lg" className="h-12 w-full rounded-xl">
            <Stethoscope className="h-4 w-4" />
            Clinician workspace
          </Button>
        </Link>
      </div>

      <ol className="space-y-3">
        {[
          "Tell us your child’s age and whether they walk independently.",
          "Record a short front-view clip — full body, 4–6 steps, phone still.",
          "Review a plain-language summary and keep questions for the appointment.",
        ].map((step, i) => (
          <li key={step} className="medical-surface flex gap-3 p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {i + 1}
            </span>
            <p className="text-sm leading-relaxed">{step}</p>
          </li>
        ))}
      </ol>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Screening support only. Share results with a qualified clinician.
      </p>

      <Link href="/" className="inline-flex items-center gap-1 text-sm text-primary">
        Back to start
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
