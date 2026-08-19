import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { UserRole } from "./roles";
import { normalizeRole } from "./roles";

export async function ensureUserProfile(
  supabase: SupabaseClient,
  user: User,
  requestedRole?: UserRole,
): Promise<UserRole> {
  const role = normalizeRole(requestedRole ?? user.user_metadata?.role);

  try {
    await supabase.from("user_profiles").upsert(
      {
        id: user.id,
        role,
        display_name:
          typeof user.user_metadata?.display_name === "string"
            ? user.user_metadata.display_name
            : user.email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } catch {
    // Table may not exist until migration 005 is applied.
  }

  if (normalizeRole(user.user_metadata?.role) !== role) {
    try {
      await supabase.auth.updateUser({
        data: { role },
      });
    } catch {
      // Metadata update is best-effort; routing still uses the requested role.
    }
  }

  return role;
}
