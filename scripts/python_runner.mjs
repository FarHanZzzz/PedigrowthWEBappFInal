#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const [, , ...args] = process.argv;

if (args.length === 0) {
  console.error("Usage: node scripts/python_runner.mjs <script.py> [args...]");
  process.exit(2);
}

const cwd = process.cwd();
const candidates = [];

if (process.env.PYTHON && process.env.PYTHON.trim().length > 0) {
  candidates.push(process.env.PYTHON.trim());
}

if (process.platform === "win32") {
  candidates.push(path.join(cwd, ".venv", "Scripts", "python.exe"));
} else {
  candidates.push(path.join(cwd, ".venv", "bin", "python"));
}

candidates.push("python3", "python");

function canRunPython(command) {
  if (command.includes(path.sep) || command.includes("/")) {
    if (!existsSync(command)) {
      return false;
    }
  }

  const probe = spawnSync(command, ["--version"], {
    cwd,
    shell: process.platform === "win32",
    stdio: "ignore",
  });

  return probe.status === 0;
}

const python = candidates.find(canRunPython);

if (!python) {
  console.error("Could not find a working Python executable.");
  process.exit(1);
}

const run = spawnSync(python, args, {
  cwd,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (run.error) {
  console.error(run.error.message);
  process.exit(1);
}

process.exit(run.status ?? 1);
