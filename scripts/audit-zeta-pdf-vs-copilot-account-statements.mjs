#!/usr/bin/env node
/**
 * Wrapper — delega al runner TS (alias @/ vía tsx).
 *
 * Uso:
 *   node scripts/audit-zeta-pdf-vs-copilot-account-statements.mjs
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runner = join(root, "scripts/audit-zeta-pdf-vs-copilot-account-statements.ts");

const envFile = join(root, ".env.local");
const args = ["--env-file", envFile, "--import", "tsx", runner, ...process.argv.slice(2)];

const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});

process.exit(result.status ?? 1);
