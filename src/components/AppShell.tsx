"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, FileClock, Home, Stethoscope } from "lucide-react";
import GlobalAssistantDock from "@/components/ai/GlobalAssistantDock";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/start", label: "Intake", icon: ClipboardList },
  { href: "/history", label: "History", icon: FileClock },
];

function isActivePath(currentPath: string, href: string): boolean {
  if (href === "/") {
    return currentPath === "/";
  }

  return currentPath === href || currentPath.startsWith(`${href}/`);
}

/**
 * Shared shell for clinical pages (everything outside landing route).
 */
export default function AppShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  return (
    <div className="clinical-shell flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-border/55 bg-card px-2.5 py-1.5 transition-colors hover:border-primary/35"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/14 text-primary">
                <Stethoscope className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-semibold tracking-tight text-foreground">Pedi-Growth</span>
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              {NAV_ITEMS.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="hidden rounded-full border border-border/70 bg-card px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:block">
            Medical Screening Support
          </div>
        </div>

        <div className="border-t border-border/50 px-4 py-2 md:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={`mobile_${item.href}`}
                  href={item.href}
                  className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 sm:px-6">{children}</main>

      <footer className="border-t border-border/55 bg-card/75 px-4 py-4">
        <p className="mx-auto max-w-6xl text-center text-xs text-muted-foreground">
          Pedi-Growth supports concern documentation and follow-up conversations. It does not diagnose medical conditions and should be used with professional clinical review.
        </p>
      </footer>

      <GlobalAssistantDock />
    </div>
  );
}
