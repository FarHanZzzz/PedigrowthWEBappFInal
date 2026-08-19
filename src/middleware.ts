import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  try {
    const { supabase, supabaseResponse } = createClient(request);
    await supabase.auth.getUser();
    return supabaseResponse;
  } catch {
    // If Supabase env is missing, allow request flow instead of hard-failing.
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};