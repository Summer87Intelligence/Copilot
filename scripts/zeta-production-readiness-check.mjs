#!/usr/bin/env node
/**
 * ZETA-15: Production readiness health gate for the Zeta sync layer.
 *
 * Validates env vars, DB tables, column migrations, recent audit data,
 * job queue state, integrity violations, and cron registration.
 *
 * Usage:
 *   node scripts/zeta-production-readiness-check.mjs
 *
 * Exits 0 if no FAIL items. Exits 1 if any FAIL.
 *
 * Env vars loaded from .env.local if present:
 *   NEXT_PUBLIC_SUPABASE_URL   — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Service role key (bypasses RLS)
 *   CRON_SECRET                — Cron authorization secret
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Load .env.local ────────────────────────────────────────────────────────────

const envLocalPath = resolve(ROOT, ".env.local");
if (existsSync(envLocalPath)) {
  const lines = readFileSync(envLocalPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

// ── Reporting helpers ──────────────────────────────────────────────────────────

let passCnt = 0;
let warnCnt = 0;
let failCnt = 0;

function report(level, message) {
  const tag = level === "PASS" ? "\x1b[32mPASS\x1b[0m" : level === "WARN" ? "\x1b[33mWARN\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  [${tag}] ${message}`);
  if (level === "PASS") passCnt++;
  else if (level === "WARN") warnCnt++;
  else failCnt++;
}

function section(title) {
  const line = "─".repeat(Math.max(0, 60 - title.length - 4));
  console.log(`\n── ${title} ${line}`);
}

function printSummary() {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  Summary: ${passCnt} PASS  ${warnCnt} WARN  ${failCnt} FAIL`);
  if (failCnt > 0) {
    console.log("  \x1b[31mStatus: NOT PRODUCTION-READY — fix FAIL items before deploying\x1b[0m");
  } else if (warnCnt > 0) {
    console.log("  \x1b[33mStatus: READY WITH WARNINGS — review WARN items\x1b[0m");
  } else {
    console.log("  \x1b[32mStatus: PRODUCTION-READY\x1b[0m");
  }
  console.log(`${"═".repeat(64)}\n`);
}

// ── 1. Env Vars ────────────────────────────────────────────────────────────────

section("Env Vars");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const CRON_SECRET_VAL = process.env.CRON_SECRET?.trim() ?? "";

if (SUPABASE_URL) report("PASS", "NEXT_PUBLIC_SUPABASE_URL set");
else report("FAIL", "NEXT_PUBLIC_SUPABASE_URL missing");

if (SERVICE_ROLE_KEY) report("PASS", "SUPABASE_SERVICE_ROLE_KEY set");
else report("FAIL", "SUPABASE_SERVICE_ROLE_KEY missing — cannot validate DB state");

if (CRON_SECRET_VAL) report("PASS", "CRON_SECRET set");
else report("WARN", "CRON_SECRET not set — cron endpoints will return 401");

// ── 2. Cron Registration (vercel.json) ─────────────────────────────────────────

section("Cron Registration (vercel.json)");

const EXPECTED_CRONS = [
  "/api/cron/zeta-sync-saldos",
  "/api/cron/zeta-sync-vouchers",
  "/api/cron/zeta-sync-contacts",
  "/api/cron/zeta-sync-cuotas",
  "/api/cron/zeta-completeness-audit",
  "/api/cron/zeta-integrity-check",
  "/api/cron/zeta-resync-worker",
];

try {
  const vercelJson = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8"));
  const registeredPaths = new Set((vercelJson.crons ?? []).map((c) => c.path));
  for (const cronPath of EXPECTED_CRONS) {
    if (registeredPaths.has(cronPath)) {
      report("PASS", `Cron registered: ${cronPath}`);
    } else {
      report("FAIL", `Cron missing from vercel.json: ${cronPath}`);
    }
  }
} catch (e) {
  report("FAIL", `Cannot read vercel.json: ${e.message}`);
}

// ── DB Checks (require credentials) ───────────────────────────────────────────

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  report("WARN", "Skipping all DB checks — SUPABASE_URL or SERVICE_ROLE_KEY missing");
  printSummary();
  process.exit(failCnt > 0 ? 1 : 0);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── 3. Table Existence ─────────────────────────────────────────────────────────

section("DB Tables");

const REQUIRED_TABLES = [
  "zeta_completeness_audits",
  "zeta_sync_divergences",
  "zeta_integrity_violations",
  "zeta_resync_jobs",
  "zeta_pipeline_runs",
];

for (const table of REQUIRED_TABLES) {
  try {
    const { error } = await supabase.from(table).select("id").limit(1);
    if (error?.code === "42P01") report("FAIL", `Table ${table} missing — run ZETA-13 migrations`);
    else if (error) report("WARN", `Table ${table} query returned error: ${error.message}`);
    else report("PASS", `Table ${table} exists and accessible`);
  } catch (e) {
    report("FAIL", `Table ${table} check threw: ${e.message}`);
  }
}

// ── 4. Column Migrations ───────────────────────────────────────────────────────

section("Column Migrations");

// ZETA-13-05: metadata jsonb column on zeta_completeness_audits
try {
  const { error } = await supabase
    .from("zeta_completeness_audits")
    .select("metadata")
    .limit(1);
  if (!error) {
    report("PASS", "zeta_completeness_audits.metadata column present (ZETA-13-05 applied)");
  } else if (error.code === "42P01") {
    report("FAIL", "zeta_completeness_audits table missing — run ZETA-13-01 migration first");
  } else if (error.message?.toLowerCase().includes("metadata") || error.message?.toLowerCase().includes("column")) {
    report("FAIL", "zeta_completeness_audits.metadata column missing — run zeta-13-05-completeness-audit-metadata.sql");
  } else {
    report("WARN", `metadata column check returned unexpected error: ${error.message}`);
  }
} catch (e) {
  report("FAIL", `metadata column check threw: ${e.message}`);
}

// ── 5. Recent Completeness Audits ─────────────────────────────────────────────

section("Recent Completeness Audits");

try {
  const { data, error } = await supabase
    .from("zeta_completeness_audits")
    .select("entity, severity, audited_at, zeta_count, local_count")
    .order("audited_at", { ascending: false })
    .limit(20);

  if (error) {
    report("WARN", `Cannot query completeness audits: ${error.message}`);
  } else if (!data || data.length === 0) {
    report("WARN", "No completeness audits found — completeness cron may not have run yet");
  } else {
    const nowMs = Date.now();
    for (const entityName of ["invoices", "receipts"]) {
      const audit = data.find((r) => r.entity === entityName);
      if (!audit) {
        report("WARN", `No completeness audit found for ${entityName}`);
        continue;
      }
      const ageH = (nowMs - new Date(audit.audited_at).getTime()) / 3_600_000;
      const ageLabel = `${ageH.toFixed(1)}h ago`;
      const drift = (audit.zeta_count ?? 0) - (audit.local_count ?? 0);
      if (ageH > 36) {
        report("WARN", `Last ${entityName} audit is ${ageLabel} — cron schedule may be broken`);
      } else {
        report("PASS", `Last ${entityName} audit: ${ageLabel}, severity=${audit.severity}, drift=${drift}`);
      }
      if (audit.severity === "critical") {
        report("WARN", `${entityName} audit severity=critical (drift=${drift}, zeta=${audit.zeta_count}, local=${audit.local_count}) — investigate`);
      }
    }
  }
} catch (e) {
  report("WARN", `Completeness audit check threw: ${e.message}`);
}

// ── 6. Resync Job Queue ────────────────────────────────────────────────────────

section("Resync Job Queue");

try {
  const { count: pendingCount, error: pendingErr } = await supabase
    .from("zeta_resync_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (pendingErr) {
    report("WARN", `Cannot count pending jobs: ${pendingErr.message}`);
  } else if ((pendingCount ?? 0) > 10) {
    report("WARN", `${pendingCount} pending resync jobs — worker may not be processing`);
  } else {
    report("PASS", `Resync job queue: ${pendingCount ?? 0} pending`);
  }

  const staleCutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  const { count: staleCount, error: staleErr } = await supabase
    .from("zeta_resync_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running")
    .lt("started_at", staleCutoff);

  if (staleErr) {
    report("WARN", `Cannot query stale jobs: ${staleErr.message}`);
  } else if ((staleCount ?? 0) > 0) {
    report("WARN", `${staleCount} stale running resync jobs (>30 min) — worker may be stuck`);
  } else {
    report("PASS", "No stale running resync jobs");
  }
} catch (e) {
  report("WARN", `Resync job queue check threw: ${e.message}`);
}

// ── 7. Integrity Violations ────────────────────────────────────────────────────

section("Integrity Violations");

try {
  const { count: critCount, error: critErr } = await supabase
    .from("zeta_integrity_violations")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .eq("severity", "critical");

  if (critErr) {
    report("WARN", `Cannot count critical violations: ${critErr.message}`);
  } else if ((critCount ?? 0) > 5) {
    report("WARN", `${critCount} open critical integrity violations — investigate before deploying`);
  } else if ((critCount ?? 0) > 0) {
    report("WARN", `${critCount} open critical integrity violation(s)`);
  } else {
    report("PASS", "No open critical integrity violations");
  }

  const { count: openCount, error: openErr } = await supabase
    .from("zeta_integrity_violations")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  if (!openErr) {
    if ((openCount ?? 0) > 20) {
      report("WARN", `${openCount} total open violations (warning+info) — review recommended`);
    } else {
      report("PASS", `Total open violations (all severities): ${openCount ?? 0}`);
    }
  }
} catch (e) {
  report("WARN", `Integrity violation check threw: ${e.message}`);
}

// ── 8. Pipeline Run Health ─────────────────────────────────────────────────────

section("Pipeline Run Health");

try {
  const staleThreshold = new Date(Date.now() - 45 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("zeta_pipeline_runs")
    .select("pipeline_name, started_at")
    .eq("status", "running")
    .lt("started_at", staleThreshold);

  if (error?.code === "42P01") {
    report("FAIL", "zeta_pipeline_runs table missing — run ZETA-13 migrations");
  } else if (error) {
    report("WARN", `Cannot query pipeline runs: ${error.message}`);
  } else if ((data ?? []).length > 0) {
    const names = (data ?? []).map((r) => r.pipeline_name).join(", ");
    report("WARN", `Stale pipeline runs (>45 min) in status=running: ${names}`);
  } else {
    report("PASS", "No stale pipeline runs (all active runs are recent)");
  }
} catch (e) {
  report("WARN", `Pipeline run check threw: ${e.message}`);
}

// ── Summary ────────────────────────────────────────────────────────────────────

printSummary();
process.exit(failCnt > 0 ? 1 : 0);
