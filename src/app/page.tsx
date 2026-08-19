import Link from "next/link";
import { ArrowRight, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function HeroLandingPage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="page-frame mx-auto flex w-full items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Stethoscope />
          </span>
          <span className="text-base font-semibold tracking-tight">Pedi-Growth</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link href="/login?role=parent" className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            Sign in
          </Link>
        </div>
      </header>

      <main className="page-frame mx-auto w-full px-4 pb-16 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-3xl pt-8 text-center sm:pt-20">
          <p className="mb-4 text-sm font-medium text-primary">Pediatric walking check</p>
          <h1 className="medical-title text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            A short walking video. A clear next conversation.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Families record one clip. Clinicians get a structured packet. Screening support only — not a diagnosis.
          </p>
        </section>

        <section className="mx-auto mt-12 grid w-full max-w-4xl gap-4 sm:grid-cols-2 lg:max-w-none lg:grid-cols-2">
          <article className="medical-surface flex flex-col p-6 text-left">
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users />
            </span>
            <h2 className="mt-4 text-xl font-semibold">I&apos;m a parent</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
              Sign in to start a walking check, reopen past summaries, and keep questions ready for the appointment.
            </p>
            <Link href="/login?role=parent" className="mt-6">
              <Button size="lg" className="h-12 w-full rounded-xl">
                Parent sign in
                <ArrowRight data-icon="inline-end" />
              </Button>
            </Link>
          </article>

          <article className="medical-surface flex flex-col p-6 text-left">
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Stethoscope />
            </span>
            <h2 className="mt-4 text-xl font-semibold">I&apos;m a clinician</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
              Sign in to open the caseload, review annotated clips, and send a follow-up note families can see.
            </p>
            <Link href="/login?role=clinician" className="mt-6">
              <Button variant="outline" size="lg" className="h-12 w-full rounded-xl">
                Clinician sign in
                <ArrowRight data-icon="inline-end" />
              </Button>
            </Link>
          </article>
        </section>

        <p className="mx-auto mt-12 flex max-w-xl items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0" />
          Pose analysis runs on the device. Saved checks reopen on phone or desktop after you sign in.
        </p>
      </main>
    </div>
  );
}
