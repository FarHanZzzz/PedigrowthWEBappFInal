export type UserRole = "parent" | "clinician" | "admin";

const ADMIN_EMAILS = new Set(["admin@gmail.com"]);

export function isAdminEmail(email: string | null | undefined): boolean {
  return ADMIN_EMAILS.has((email ?? "").trim().toLowerCase());
}

export function normalizeRole(value: unknown): UserRole {
  if (value === "clinician" || value === "admin" || value === "parent") {
    return value;
  }
  return "parent";
}

export function dashboardPath(role: unknown, preferredView?: UserRole): string {
  if (normalizeRole(role) === "admin") {
    if (preferredView === "clinician") return "/portal/clinician";
    if (preferredView === "parent") return "/portal/parent";
    return "/portal/admin";
  }
  const normalized = normalizeRole(role);
  if (normalized === "clinician") return "/portal/clinician";
  return "/portal/parent";
}

export function canAccessParentPortal(role: unknown): boolean {
  const normalized = normalizeRole(role);
  return normalized === "parent" || normalized === "admin";
}

export function canAccessClinicianPortal(role: unknown): boolean {
  const normalized = normalizeRole(role);
  return normalized === "clinician" || normalized === "admin";
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
