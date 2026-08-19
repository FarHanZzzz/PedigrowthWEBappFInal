import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/middleware";
import {
  canAccessClinicianPortal,
  canAccessParentPortal,
  dashboardPath,
  isAdminEmail,
  normalizeRole,
  roleFromPath,
} from "@/lib/auth/roles";

const PUBLIC_PREFIXES = [
  "/login",
  "/auth/callback",
  "/share",
  "/api/",
  "/supabase-test",
  "/home",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function resolvedRole(user: { email?: string | null; user_metadata?: { role?: unknown } }): ReturnType<typeof normalizeRole> {
  if (isAdminEmail(user.email)) return "admin";
  return normalizeRole(user.user_metadata?.role);
}

export async function middleware(request: NextRequest) {
  try {
    const { supabase, supabaseResponse } = createClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    if (!user && !isPublicPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      url.searchParams.set("role", roleFromPath(pathname));
      return NextResponse.redirect(url);
    }

    if (user && (pathname === "/" || pathname === "/login" || pathname === "/clinician")) {
      const role = resolvedRole(user);
      const url = request.nextUrl.clone();
      const next = request.nextUrl.searchParams.get("next");
      const preferred = roleFromPath(next ?? pathname);
      url.pathname = next && next.startsWith("/") ? next : dashboardPath(role, preferred);
      url.search = "";
      return NextResponse.redirect(url);
    }

    const role = user ? resolvedRole(user) : null;

    if (user && pathname.startsWith("/portal/clinician") && !canAccessClinicianPortal(role)) {
      const url = request.nextUrl.clone();
      url.pathname = dashboardPath(role);
      return NextResponse.redirect(url);
    }

    if (user && /^\/results\/[^/]+\/clinician/.test(pathname) && !canAccessClinicianPortal(role)) {
      const url = request.nextUrl.clone();
      url.pathname = dashboardPath(role);
      return NextResponse.redirect(url);
    }

    const familyResultMatch = pathname.match(/^\/results\/([^/]+)$/);
    if (user && familyResultMatch && role === "clinician") {
      const url = request.nextUrl.clone();
      url.pathname = `/results/${familyResultMatch[1]}/clinician`;
      return NextResponse.redirect(url);
    }

    if (user && pathname.startsWith("/portal/admin")) {
      if (role !== "admin") {
        const url = request.nextUrl.clone();
        url.pathname = dashboardPath(role);
        return NextResponse.redirect(url);
      }
    }

    if (user && pathname.startsWith("/portal/parent") && !canAccessParentPortal(role)) {
      const url = request.nextUrl.clone();
      url.pathname = dashboardPath(role);
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch {
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
