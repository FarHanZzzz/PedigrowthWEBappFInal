import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Database,
  Lock,
  Shield,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function PortalGatePage() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="pointer-events-none absolute left-[-10rem] top-[-8rem] h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute right-[-8rem] top-[30%] h-[22rem] w-[22rem] rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-6rem] left-[30%] h-[18rem] w-[18rem] rounded-full bg-primary/8 blur-3xl" />

      {/* Header */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Stethoscope className="h-4.5 w-4.5" />
          </span>
          <div>
            <span className="block text-base font-semibold tracking-tight">Pedi-Growth</span>
            <span className="block text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Pediatric Gait Platform
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="hidden gap-1.5 px-2.5 py-1 text-[11px] sm:flex">
            <ShieldCheck className="h-3 w-3" />
            Clinical Support Interface
          </Badge>
          <Link href="/home">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
              Product Overview
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-12 pt-6 sm:px-6">
        <div className="med-slide-up mx-auto mb-10 max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4 gap-1.5 px-3 py-1 text-xs">
            <Activity className="h-3.5 w-3.5" />
            Hackathon Demo — April 2026
          </Badge>
          <h1 className="medical-title text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            Who are you entering as?
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Select your role to access your personalised portal. In production, each entry
            point is protected by Supabase Auth with role-based access control.
          </p>
        </div>

        {/* Role Cards */}
        <div className="med-slide-up med-stagger-1 grid gap-5 sm:grid-cols-3">

          {/* Parent / Patient Portal */}
          <Link href="/portal/parent" className="group block">
            <div className="medical-surface flex h-full flex-col p-6 transition-all duration-300 group-hover:shadow-[0_28px_56px_rgba(16,36,45,0.16)] group-hover:-translate-y-1">
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20 transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-primary">
                <Users className="h-6 w-6" />
              </div>
              <div className="mb-1 flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Portal A</p>
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Parent</Badge>
              </div>
              <h2 className="medical-title mb-2 text-xl font-semibold text-foreground">Parent & Patient</h2>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                Record your child&apos;s walking video, complete the intake form, view
                AI-assisted gait observations, and see your full assessment history.
              </p>
              <div className="mt-5 space-y-2">
                {["Start new gait assessment", "View parent-friendly results", "Check assessment history"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                    {f}
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <Button className="cta-gradient w-full gap-2 rounded-xl font-semibold">
                  Enter Parent Portal <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Link>

          {/* Clinician Portal */}
          <Link href="/portal/clinician" className="group block">
            <div className="medical-surface flex h-full flex-col p-6 ring-1 ring-primary/30 transition-all duration-300 group-hover:shadow-[0_28px_56px_rgba(16,36,45,0.16)] group-hover:-translate-y-1">
              <div className="mb-3 flex justify-end">
                <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary">
                  Recommended for demo
                </span>
              </div>
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/20 text-accent-foreground ring-1 ring-accent/30 transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-primary">
                <Stethoscope className="h-6 w-6" />
              </div>
              <div className="mb-1 flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Portal B</p>
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Clinician</Badge>
              </div>
              <h2 className="medical-title mb-2 text-xl font-semibold text-foreground">Clinician & Specialist</h2>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                Access structured clinical handoff packets, review evidence-backed gait
                analysis, manage patient caseloads, and submit clinical follow-up feedback.
              </p>
              <div className="mt-5 space-y-2">
                {["Decision-first clinical packet", "Advanced evidence with Tier 1 3D view", "Submit follow-up notes to patient"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-foreground/60" />
                    {f}
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <Button variant="outline" className="w-full gap-2 rounded-xl border-primary/40 font-semibold text-primary hover:bg-primary hover:text-primary-foreground">
                  Enter Clinician Portal <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Link>

          {/* Admin Portal */}
          <Link href="/portal/admin" className="group block">
            <div className="medical-surface flex h-full flex-col p-6 transition-all duration-300 group-hover:shadow-[0_28px_56px_rgba(16,36,45,0.16)] group-hover:-translate-y-1">
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-primary">
                <Shield className="h-6 w-6" />
              </div>
              <div className="mb-1 flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Portal C</p>
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Admin</Badge>
              </div>
              <h2 className="medical-title mb-2 text-xl font-semibold text-foreground">System Admin</h2>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                Oversee the entire platform — review all assessment activity, manage
                clinic-patient connections, and monitor system-wide audit logs.
              </p>
              <div className="mt-5 space-y-2">
                {["View all assessment records", "Review audit logs", "Monitor system activity"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                    {f}
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <Button variant="ghost" className="w-full gap-2 rounded-xl border border-border/60 font-semibold text-muted-foreground hover:text-foreground">
                  Enter Admin Console <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Link>
        </div>

        {/* Production Architecture Note */}
        <div className="med-slide-up med-stagger-2 mx-auto mt-10 max-w-3xl rounded-2xl border border-border/60 bg-surface-container-low/60 p-4 text-center">
          <div className="mb-2 flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
            <Lock className="h-4 w-4 text-primary" />
            Production Architecture Note
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            In production, each portal is protected by{" "}
            <span className="font-semibold text-foreground">Supabase Auth</span> with{" "}
            <span className="font-semibold text-foreground">Row Level Security (RLS)</span>{" "}
            and role-based access control. The database schema, migrations, and RLS policies
            are already written in{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              supabase/migrations/
            </code>
            . For this demo, all portals share one browser session to allow end-to-end
            data flow demonstration.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            {[
              { icon: Database, label: "Supabase Postgres" },
              { icon: Shield, label: "Row Level Security" },
              { icon: Lock, label: "Supabase Auth (RBAC)" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <item.icon className="h-3.5 w-3.5 text-primary/70" />
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-border/60 px-4 py-4 text-center text-[11px] text-muted-foreground">
        Pedi-Growth — Observational support tool. Not a diagnostic system.
        Clinical decisions must be made by qualified healthcare professionals.
      </footer>
    </div>
  );
}
