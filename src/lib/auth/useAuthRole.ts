"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { isAdminEmail, normalizeRole, type UserRole } from "@/lib/auth/roles";

const ROLE_CACHE_KEY = "pedigrowth_role";

export function roleFromUser(email?: string | null, metadataRole?: unknown): UserRole {
  if (isAdminEmail(email)) return "admin";
  return normalizeRole(metadataRole);
}

function readCachedRole(): UserRole | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(ROLE_CACHE_KEY);
  if (raw === "parent" || raw === "clinician" || raw === "admin") return raw;
  return null;
}

export function useAuthRole(): UserRole | null {
  // Always start null so the server HTML and the first client paint match.
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    const cached = readCachedRole();
    if (cached) setRole(cached);

    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      const resolved = roleFromUser(data.user.email, data.user.user_metadata?.role);
      try {
        window.sessionStorage.setItem(ROLE_CACHE_KEY, resolved);
      } catch {
        // Ignore storage errors in private browsing.
      }
      setRole(resolved);
    });
  }, []);

  return role;
}
