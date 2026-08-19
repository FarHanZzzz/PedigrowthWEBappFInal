import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ClipboardList,
  Eye,
  FlaskConical,
  FileClock,
  Play,
  ShieldCheck,
  Stethoscope,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "GAITBRIDGE — Product Overview",
  description: "Professional pediatric gait documentation for families and clinical teams.",
};

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-[-8rem] top-[-6rem] h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute right-[-6rem] top-[20%] h-72 w-72 rounded-full bg-accent/20 blur-3xl" />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Stethoscope className="h-4 w-4" />
          </span>
          <span className="text-base font-semibold tracking-tight">Pedi-Growth</span>
        </Link>

        <nav className="flex items-center gap-2">
          <Link href="/start" className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">Start Intake</Link>
          <Link href="/capture" className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">Capture</Link>
          <Link href="/history" className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">History</Link>
          <Link href="/">
            <Button size="sm" variant="outline" className="ml-2 text-xs">← Portal Select</Button>
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-14 pt-4 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div className="med-slide-up space-y-4">
          <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-xs">
            <ShieldCheck className="h-3.5 w-3.5" />
            Clinical Support Interface - Non-diagnostic
          </Badge>

          <h1 className="medical-title max-w-2xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            Professional pediatric gait documentation for families and clinical teams.
          </h1>

          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            Capture one front-view walking clip, review evidence-backed observations, and share a structured handoff summary with clinicians in minutes.
          </p>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Link href="/start" className="w-full sm:w-auto">
              <Button size="lg" className="cta-gradient w-full gap-2 rounded-xl px-6 text-base font-semibold sm:w-auto" id="cta-start">
                <Play className="h-4 w-4" />
                Start New Assessment
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/history" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full gap-2 rounded-xl px-6 text-base sm:w-auto">
                <FileClock className="h-4 w-4" />
                Open Assessment History
              </Button>
            </Link>
          </div>

          <p className="text-xs font-medium text-muted-foreground">
            Local-first processing. No diagnosis claims. Designed for follow-up conversations with qualified professionals.
          </p>
        </div>

        <div className="medical-surface med-slide-up med-stagger-2 space-y-4 p-5 sm:p-6">
          <h2 className="medical-title text-xl font-semibold">Operational Flow</h2>
          <div className="space-y-2.5">
            {[
              { icon: ClipboardList, title: "Intake", desc: "Age, mobility status, consent" },
              { icon: Video, title: "Capture", desc: "Guided recording and quality preflight" },
              { icon: Activity, title: "Analysis", desc: "Pose extraction and concern profiling" },
              { icon: FlaskConical, title: "Results", desc: "Caregiver summary + clinician packet" },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3 rounded-xl bg-surface-container-low p-3">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <item.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/80">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-10 sm:px-6 lg:grid-cols-3">
          {[
            {
              icon: Eye,
              title: "Explainable by design",
              desc: "Every output includes evidence notes, confidence context, and clearly stated limitations.",
            },
            {
              icon: ShieldCheck,
              title: "Safety language built in",
              desc: "The experience avoids diagnostic claims and guides users toward appropriate clinical follow-up.",
            },
            {
              icon: Activity,
              title: "Operationally connected",
              desc: "Intake, capture, analysis, results, and history are linked through one continuous workflow.",
            },
          ].map((item) => (
            <article key={item.title} className="rounded-2xl border border-border/60 bg-surface p-5 shadow-[0_10px_24px_rgba(16,36,45,0.08)]">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <item.icon className="h-4 w-4" />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-foreground">{item.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="medical-surface flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Ready to run a complete flow?</p>
            <h2 className="medical-title mt-1 text-2xl font-semibold">Begin with intake to route each child appropriately.</h2>
            <p className="mt-1 text-sm text-muted-foreground">Children who are not independently walking are routed to Concern Navigator with tailored guidance.</p>
          </div>
          <Link href="/start" className="sm:shrink-0">
            <Button size="lg" className="cta-gradient w-full gap-2 rounded-xl px-6 sm:w-auto">
              Start Intake
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border/60 px-4 py-6 text-center text-xs text-muted-foreground sm:px-6">
        Pedi-Growth is an observational support tool and does not diagnose conditions. Clinical decisions must be made by qualified healthcare professionals.
      </footer>
    </div>
  );
}
