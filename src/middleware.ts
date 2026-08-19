import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/middleware";
import {
  canAccessClinicianPortal,
  canAccessParentPortal,
  dashboardPath,
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
      const role = normalizeRole(user.user_metadata?.role);
      const url = request.nextUrl.clone();
      const next = request.nextUrl.searchParams.get("next");
      const preferred = roleFromPath(next ?? pathname);
      url.pathname = next && next.startsWith("/") ? next : dashboardPath(role, preferred);
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (user && pathname.startsWith("/portal/clinician") && !canAccessClinicianPortal(user.user_metadata?.role)) {
      const url = request.nextUrl.clone();
      url.pathname = dashboardPath(user.user_metadata?.role);
      return NextResponse.redirect(url);
    }

    if (user && pathname.startsWith("/portal/admin")) {
      const role = normalizeRole(user.user_metadata?.role);
      if (role !== "admin") {
        const url = request.nextUrl.clone();
        url.pathname = dashboardPath(role);
        return NextResponse.redirect(url);
      }
    }

    if (user && pathname.startsWith("/portal/parent") && !canAccessParentPortal(user.user_metadata?.role)) {
      const url = request.nextUrl.clone();
      url.pathname = dashboardPath(user.user_metadata?.role);
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
