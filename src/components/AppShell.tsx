"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileClock, Home, LogOut, Plus, Stethoscope, Users } from "lucide-react";
import GlobalAssistantDock from "@/components/ai/GlobalAssistantDock";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { dashboardPath } from "@/lib/auth/roles";
import { useAuthRole } from "@/lib/auth/useAuthRole";
import { cn } from "@/lib/utils";

const FAMILY_NAV = [
  { href: "/portal/parent", label: "Home", icon: Home, match: (path: string) => path.startsWith("/portal/parent") },
  { href: "/start", label: "New check", icon: Plus, match: (path: string) => path.startsWith("/start") || path.startsWith("/capture") || path.startsWith("/analyzing") || path.startsWith("/concern") },
  { href: "/history", label: "History", icon: FileClock, match: (path: string) => path.startsWith("/history") || path.startsWith("/results") },
];

const CLINICIAN_NAV = [
  { href: "/portal/clinician", label: "Home", icon: Home, match: (path: string) => path === "/clinician" || path.startsWith("/portal/clinician") },
  { href: "/history", label: "History", icon: FileClock, match: (path: string) => path.startsWith("/history") || path.startsWith("/results") },
  { href: "/start", label: "New check", icon: Plus, match: (path: string) => path.startsWith("/start") || path.startsWith("/capture") || path.startsWith("/analyzing") },
];

const ADMIN_NAV = [
  { href: "/portal/admin", label: "Home", icon: Home, match: (path: string) => path.startsWith("/portal/admin") },
  { href: "/portal/parent", label: "Family", icon: Users, match: (path: string) => path.startsWith("/portal/parent") },
  { href: "/portal/clinician", label: "Caseload", icon: Stethoscope, match: (path: string) => path.startsWith("/portal/clinician") },
  { href: "/history", label: "History", icon: FileClock, match: (path: string) => path.startsWith("/history") || path.startsWith("/results") },
];

function navForPath(pathname: string) {
  if (pathname.startsWith("/portal/admin")) return ADMIN_NAV;
  if (pathname === "/clinician" || pathname.startsWith("/portal/clinician")) return CLINICIAN_NAV;
  return FAMILY_NAV;
}

function navForRole(role: "parent" | "clinician" | "admin" | null, pathname: string) {
  if (role === "admin") return ADMIN_NAV;
  if (role === "clinician") return CLINICIAN_NAV;
  if (role === "parent") return FAMILY_NAV;
  return navForPath(pathname);
}

export default function AppShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const role = useAuthRole();
  const navItems = navForRole(role, pathname);
  const homeHref = dashboardPath(
    role ??
      (pathname.startsWith("/portal/admin")
        ? "admin"
        : pathname === "/clinician" || pathname.startsWith("/portal/clinician")
          ? "clinician"
          : "parent"),
  );
  const isResults = pathname.startsWith("/results") || pathname.startsWith("/share");
  const hideBottomNav = pathname.startsWith("/analyzing");

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    try {
      window.sessionStorage.removeItem("pedigrowth_role");
    } catch {
      // Ignore storage errors in private browsing.
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="page-frame mx-auto flex h-14 w-full items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href={homeHref} className="inline-flex items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Stethoscope />
            </span>
            <span className="text-sm font-semibold tracking-tight">Pedi-Growth</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  item.match(pathname)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            {role && (
              <span className="hidden rounded-full px-3 py-1.5 text-xs text-muted-foreground sm:inline">
                {role === "clinician" ? "Clinician" : role === "admin" ? "Admin" : "Family"}
              </span>
            )}
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => void signOut()} title="Sign out">
              <LogOut />
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className={cn("page-frame mx-auto w-full flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8", !hideBottomNav && "pb-24 md:pb-8")}>
        {children}
      </main>

      {isResults && (
        <footer className="border-t border-border/60 print:hidden">
          <p className="page-frame mx-auto px-4 py-4 text-center text-xs leading-relaxed text-muted-foreground sm:px-6 lg:px-8">
            This is a screening summary for a clinician conversation. It does not diagnose a medical condition.
          </p>
        </footer>
      )}

      {!hideBottomNav && (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          <div className={cn("mx-auto grid max-w-lg px-2 py-1.5", navItems.length > 3 ? "grid-cols-4" : "grid-cols-3")}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {isResults && <GlobalAssistantDock />}
    </div>
  );
}
