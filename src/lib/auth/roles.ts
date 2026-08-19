export type UserRole = "parent" | "clinician" | "admin";

export function normalizeRole(value: unknown): UserRole {
  if (value === "clinician" || value === "admin" || value === "parent") {
    return value;
  }
  return "parent";
}

export function dashboardPath(role: unknown): string {
  const normalized = normalizeRole(role);
  if (normalized === "clinician") return "/portal/clinician";
  if (normalized === "admin") return "/portal/admin";
  return "/portal/parent";
}

export function roleFromPath(pathname: string): UserRole {
  if (
    pathname.startsWith("/portal/clinician") ||
    pathname.startsWith("/clinician") ||
    pathname.includes("/clinician")
  ) {
    return "clinician";
  }
  if (pathname.startsWith("/portal/admin")) {
    return "admin";
  }
  return "parent";
}
