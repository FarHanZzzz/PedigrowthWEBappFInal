#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

function parseArg(flag, fallback = "") {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

const target = parseArg("--target");
const fileArg = parseArg("--file");

if (!target || !["frontend", "backend"].includes(target)) {
  console.error("Usage: node scripts/deploy/check_digitalocean_env.mjs --target <frontend|backend> --file <path>");
  process.exit(2);
}

const defaultFile = target === "frontend"
  ? ".env.digitalocean.frontend"
  : ".env.digitalocean.backend";
const envPath = path.resolve(process.cwd(), fileArg || defaultFile);

if (!fs.existsSync(envPath)) {
  console.error(`Env file not found: ${envPath}`);
  process.exit(1);
}

const content = fs.readFileSync(envPath, "utf-8");
const parsed = {};

for (const line of content.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx <= 0) continue;
  const key = trimmed.slice(0, idx).trim();
  const value = trimmed.slice(idx + 1).trim();
  parsed[key] = value;
}

const required = target === "frontend"
  ? [
      "GAIT_PIPELINE_API_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]
  : ["PORT", "CORS_ALLOW_ORIGINS"];

const missing = required.filter((key) => !parsed[key]);

if (missing.length > 0) {
  console.error(`Missing required keys for ${target}:`);
  for (const key of missing) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

console.log(`Environment validation passed for ${target}.`);
console.log(`Validated file: ${envPath}`);
