import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/db/server";
import { createAdminSupabaseClient } from "@/lib/db/admin";
import { isAdminEmail, normalizeRole } from "@/lib/auth/roles";

const VIDEO_BUCKET = "hackathon_videos";

function isSafeResultId(value: string): boolean {
  return /^[a-zA-Z0-9._-]{4,80}$/.test(value);
}

function isMissingTable(message: string, table: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes(table) && normalized.includes("could not find the table");
}

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  }

  const role = isAdminEmail(user.email) ? "admin" : normalizeRole(user.user_metadata?.role);
  if (role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  }

  return { ok: true as const, supabase };
}

async function deleteCloudVideoFolder(
  client: { storage: ReturnType<typeof createAdminSupabaseClient>["storage"] },
  resultId: string,
) {
  const { data, error } = await client.storage.from(VIDEO_BUCKET).list(resultId, { limit: 50 });
  if (error || !data || data.length === 0) {
    return;
  }

  const paths = data
    .map((entry) => entry.name)
    .filter((name) => Boolean(name) && !name.endsWith("/"))
    .map((name) => `${resultId}/${name}`);

  if (paths.length > 0) {
    await client.storage.from(VIDEO_BUCKET).remove(paths);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const resultId = decodeURIComponent(id ?? "").trim();

  if (!isSafeResultId(resultId)) {
    return NextResponse.json({ error: "Invalid assessment id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    let admin: { storage: ReturnType<typeof createAdminSupabaseClient>["storage"]; from: ReturnType<typeof createAdminSupabaseClient>["from"] };
    try {
      admin = createAdminSupabaseClient();
    } catch {
      admin = auth.supabase;
    }

    const packetDelete = await admin.from("shared_packets").delete().eq("assessment_ref", resultId);
    if (packetDelete.error && !isMissingTable(packetDelete.error.message, "shared_packets")) {
      console.error("[admin] shared packet delete failed:", packetDelete.error);
    }

    const resultDelete = await admin.from("hackathon_results").delete().eq("id", resultId);
    if (resultDelete.error && !isMissingTable(resultDelete.error.message, "hackathon_results")) {
      return NextResponse.json(
        { error: "Could not delete the cloud assessment record." },
        { status: 500 },
      );
    }

    try {
      await deleteCloudVideoFolder(admin, resultId);
    } catch (error) {
      console.error("[admin] cloud video delete failed:", error);
    }

    return NextResponse.json({ ok: true, id: resultId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
