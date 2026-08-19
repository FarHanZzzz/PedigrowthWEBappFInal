import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const email = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? "admin@gmail.com").trim().toLowerCase();
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!password) {
  console.error("Set ADMIN_BOOTSTRAP_PASSWORD before running this script.");
  process.exit(1);
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: {
    role: "admin",
    display_name: "Admin",
  },
});

let userId = created?.user?.id ?? null;

if (createError) {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users?.find((user) => (user.email ?? "").toLowerCase() === email);
  if (!existing) {
    console.error(createError.message);
    process.exit(1);
  }

  userId = existing.id;
  const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    user_metadata: {
      ...(existing.user_metadata ?? {}),
      role: "admin",
      display_name: existing.user_metadata?.display_name ?? "Admin",
    },
  });
  if (updateError) {
    console.error(updateError.message);
    process.exit(1);
  }
}

if (userId) {
  await admin.from("user_profiles").upsert({
    id: userId,
    role: "admin",
    display_name: "Admin",
    updated_at: new Date().toISOString(),
  });
}

console.log(`Admin account ready: ${email}`);
console.log("Sign in on Parent or Clinician to open that dashboard. Header switches both.");
