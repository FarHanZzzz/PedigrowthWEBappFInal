"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Stethoscope, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/utils/supabase/client";
import { ensureUserProfile } from "@/lib/auth/ensureProfile";
import { dashboardPath, isAdminEmail, normalizeRole, type UserRole } from "@/lib/auth/roles";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = normalizeRole(searchParams.get("role"));
  const nextPath = searchParams.get("next");

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<UserRole>(initialRole === "admin" ? "parent" : initialRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const heading = useMemo(
    () => (role === "clinician" ? "Clinician sign in" : "Family sign in"),
    [role],
  );

  async function finishSession(userRole: UserRole, preferredView?: UserRole) {
    const destination =
      nextPath && nextPath.startsWith("/")
        ? nextPath
        : dashboardPath(userRole, preferredView);
    router.replace(destination);
    router.refresh();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);

    try {
      const supabase = createClient();

      if (mode === "signup") {
        const origin = window.location.origin;
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              role,
              display_name: displayName.trim() || email.trim(),
            },
            emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(dashboardPath(role))}`,
          },
        });

        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        if (!data.session || !data.user) {
          setInfo("Check your email to confirm this account, then sign in.");
          setMode("signin");
          return;
        }

        const resolved = await ensureUserProfile(supabase, data.user, role);
        await finishSession(resolved, role);
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError || !data.user) {
        setError(signInError?.message ?? "Unable to sign in.");
        return;
      }

      const existingRole = isAdminEmail(data.user.email)
        ? "admin"
        : normalizeRole(data.user.user_metadata?.role);
      if (
        existingRole !== "admin" &&
        existingRole !== role &&
        data.user.user_metadata?.role
      ) {
        setError(
          existingRole === "clinician"
            ? "This account is a clinician account. Switch the tab above and try again."
            : "This account is a family account. Switch the tab above and try again.",
        );
        await supabase.auth.signOut();
        return;
      }

      const resolved = await ensureUserProfile(supabase, data.user, role);
      await finishSession(resolved, role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Link href="/" className="mb-8 inline-flex items-center gap-2 self-center">
        <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Stethoscope />
        </span>
        <span className="text-base font-semibold tracking-tight">Pedi-Growth</span>
      </Link>

      <Card className="medical-surface py-0">
        <CardHeader className="gap-3 px-5 pt-5">
          <CardTitle className="medical-title text-2xl font-semibold">{heading}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to open your dashboard."
              : "Create an account to save walking checks to this dashboard."}
          </p>
          <Tabs value={role} onValueChange={(value) => setRole(normalizeRole(value))}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="parent" className="gap-1.5">
                <Users />
                Parent
              </TabsTrigger>
              <TabsTrigger value="clinician" className="gap-1.5">
                <Stethoscope />
                Clinician
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            {mode === "signup" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="displayName">Name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your name"
                  className="h-11 rounded-xl"
                  autoComplete="name"
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@email.com"
                className="h-11 rounded-xl"
                autoComplete="email"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
                className="h-11 rounded-xl"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </div>

            {error && (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
            {info && (
              <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">{info}</p>
            )}

            <Button type="submit" size="lg" className="h-12 rounded-xl" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "Need an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="font-medium text-primary"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError("");
                setInfo("");
              }}
            >
              {mode === "signin" ? "Create one" : "Sign in"}
            </button>
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Admin can sign in on either tab, then switch Family and Caseload in the header.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
