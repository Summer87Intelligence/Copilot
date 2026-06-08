#!/usr/bin/env node
/**
 * Auditoría de salud de sincronización Zeta — Nivel 2 (LIVE).
 *
 * Revisa el estado actual de la sincronización sin comparar contra PDFs:
 *  - Último run exitoso por pipeline (zeta_pipeline_runs)
 *  - Pipelines vencidos / con errores consecutivos
 *  - Auditorías de completeness recientes (zeta_completeness_audits)
 *  - Facturas / recibos / saldos por período y moneda (proto_invoices, proto_receipts)
 *  - Recibos VARIOS / pending_review
 *  - Shadows duplicados (saldo pendiente con mismo RegistroId que CCV1)
 *  - Clientes sin empresa local (ClienteCodigo sin match en proto_companies)
 *  - Errores del último cron por pipeline
 *
 * Uso:
 *   npx tsx scripts/audit-zeta-current-sync-health.ts
 *   npx tsx scripts/audit-zeta-current-sync-health.ts --workspace <uuid>
 *   npx tsx scripts/audit-zeta-current-sync-health.ts --output tmp/sync-health-custom.csv
 *
 * Env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   AUDIT_WORKSPACE_ID (opcional; sin él audita todos los workspaces)
 *
 * Output: tmp/zeta-current-sync-health.csv
 *
 * GARANTÍAS:
 *   100% read-only. No escribe en Supabase. No modifica tablas ni triggers.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  PIPELINE_EXPECTED_INTERVALS_MS,
  derivePipelineHealth,
} from "@/lib/data/zeta-pipeline-health";
import { ZETA_PIPELINE_NAMES } from "@/lib/data/zeta-pipeline-run-types";
import type { ZetaPipelineRunRow } from "@/lib/data/zeta-pipeline-run-types";
import { zetaReciboIsVarios } from "@/lib/integrations/zeta/zeta-api-contract";

// ── Env ───────────────────────────────────────────────────────────────────────

function loadEnvLocal(): void {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) {
    console.warn("[env] .env.local no encontrado, usando process.env");
    return;
  }
  for (const raw of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const workspaceArg = getArg("--workspace") ?? process.env.AUDIT_WORKSPACE_ID;
const outputPath =
  getArg("--output") ??
  path.join(process.cwd(), "tmp", "zeta-current-sync-health.csv");

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceKey) {
  console.error("[ERROR] Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// ── Health row type ───────────────────────────────────────────────────────────

type HealthRow = {
  check_category: string;
  check_name: string;
  status: "ok" | "warning" | "error" | "info";
  value: string;
  detail: string;
  workspace_company_id: string;
};

// ── Workspace resolution ──────────────────────────────────────────────────────

async function resolveWorkspaceIds(): Promise<string[]> {
  if (workspaceArg) return [workspaceArg];
  const { data, error } = await sb.from("companies").select("id").limit(200);
  if (error || !data) {
    console.warn("[warn] No se pudo listar workspaces:", error?.message);
    return [];
  }
  return (data as { id: string }[]).map((r) => r.id);
}

// ── Pipeline health ───────────────────────────────────────────────────────────

async function checkPipelineHealth(): Promise<HealthRow[]> {
  const rows: HealthRow[] = [];
  const now = Date.now();

  const allPipelineNames = Object.values(ZETA_PIPELINE_NAMES);

  for (const pipelineName of allPipelineNames) {
    const { data, error } = await sb
      .from("zeta_pipeline_runs")
      .select(
        "id, pipeline_name, started_at, finished_at, duration_ms, status, rows_processed, rows_updated, rows_failed, error_summary, workspace_company_id, last_heartbeat_at"
      )
      .eq("pipeline_name", pipelineName)
      .order("started_at", { ascending: false })
      .limit(20);

    if (error) {
      rows.push({
        check_category: "pipeline_health",
        check_name: pipelineName,
        status: "error",
        value: "query_failed",
        detail: error.message,
        workspace_company_id: "fleet",
      });
      continue;
    }

    const runs = (data ?? []) as ZetaPipelineRunRow[];
    const expectedMs =
      PIPELINE_EXPECTED_INTERVALS_MS[pipelineName] ?? 24 * 60 * 60 * 1_000;
    const health = derivePipelineHealth(pipelineName, runs, expectedMs, now);

    let status: HealthRow["status"] = "ok";
    if (health.status === "stalled") status = "error";
    else if (health.status === "degraded") status = "warning";
    else if (health.status === "unknown") status = "warning";

    const lastSuccessAgo = health.last_success_at
      ? Math.round((now - new Date(health.last_success_at).getTime()) / 60_000)
      : null;

    rows.push({
      check_category: "pipeline_health",
      check_name: pipelineName,
      status,
      value: health.status,
      detail: [
        `last_success=${health.last_success_at ?? "nunca"}`,
        lastSuccessAgo !== null ? `${lastSuccessAgo}m ago` : "",
        health.consecutive_failures > 0
          ? `failures=${health.consecutive_failures}`
          : "",
        health.is_overdue ? "OVERDUE" : "",
        health.last_error_summary ? `err=${health.last_error_summary.slice(0, 80)}` : "",
        `rows_processed=${health.last_run_rows_processed ?? 0}`,
      ]
        .filter(Boolean)
        .join(" | "),
      workspace_company_id: "fleet",
    });
  }

  return rows;
}

// ── Completeness audits ───────────────────────────────────────────────────────

async function checkCompletenessAudits(workspaceIds: string[]): Promise<HealthRow[]> {
  const rows: HealthRow[] = [];

  for (const wid of workspaceIds) {
    const { data, error } = await sb
      .from("zeta_completeness_audits")
      .select(
        "id, entity, audit_scope, period_year, period_month, zeta_count, local_count, missing_registro_ids, severity, notes, created_at"
      )
      .eq("workspace_company_id", wid)
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) {
      rows.push({
        check_category: "completeness_audit",
        check_name: "query",
        status: "error",
        value: "query_failed",
        detail: error.message,
        workspace_company_id: wid,
      });
      continue;
    }

    const audits = (data ?? []) as {
      id: string;
      entity: string;
      audit_scope: string;
      period_year: number | null;
      period_month: number | null;
      zeta_count: number;
      local_count: number;
      missing_registro_ids: string[] | null;
      severity: string;
      notes: string | null;
      created_at: string;
    }[];

    if (audits.length === 0) {
      rows.push({
        check_category: "completeness_audit",
        check_name: "no_audits",
        status: "warning",
        value: "0 audits",
        detail: "No hay registros recientes en zeta_completeness_audits",
        workspace_company_id: wid,
      });
      continue;
    }

    // Group by entity, take most recent
    const byEntity = new Map<string, typeof audits[0]>();
    for (const a of audits) {
      if (!byEntity.has(a.entity)) byEntity.set(a.entity, a);
    }

    for (const [entity, audit] of byEntity.entries()) {
      const drift = audit.zeta_count - audit.local_count;
      const missing = audit.missing_registro_ids?.length ?? 0;
      const status: HealthRow["status"] =
        audit.severity === "critical" || missing > 0
          ? "error"
          : audit.severity === "warning"
          ? "warning"
          : "ok";

      rows.push({
        check_category: "completeness_audit",
        check_name: entity,
        status,
        value: `zeta=${audit.zeta_count} local=${audit.local_count} drift=${drift}`,
        detail: [
          `scope=${audit.audit_scope}`,
          audit.period_year
            ? `period=${audit.period_year}-${String(audit.period_month ?? 0).padStart(2, "0")}`
            : "",
          missing > 0 ? `missing=${missing}` : "",
          audit.severity !== "ok" ? `severity=${audit.severity}` : "",
          audit.notes ? `notes=${audit.notes.slice(0, 60)}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
        workspace_company_id: wid,
      });
    }
  }

  return rows;
}

// ── Proto counts ──────────────────────────────────────────────────────────────

async function checkProtoCounts(workspaceIds: string[]): Promise<HealthRow[]> {
  const rows: HealthRow[] = [];

  for (const wid of workspaceIds) {
    // Invoice counts
    const { count: invoiceCount } = await sb
      .from("proto_invoices")
      .select("id", { count: "exact", head: true })
      .eq("workspace_company_id", wid)
      .neq("category", "Zeta / saldos pendientes");

    const { count: shadowCount } = await sb
      .from("proto_invoices")
      .select("id", { count: "exact", head: true })
      .eq("workspace_company_id", wid)
      .eq("category", "Zeta / saldos pendientes");

    const { count: receiptCount } = await sb
      .from("proto_receipts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_company_id", wid);

    const { count: companyCount } = await sb
      .from("proto_companies")
      .select("id", { count: "exact", head: true })
      .eq("workspace_company_id", wid);

    let installmentCount: number | null = null;
    try {
      const { count } = await sb
        .from("proto_invoice_installments")
        .select("id", { count: "exact", head: true })
        .eq("workspace_company_id", wid);
      installmentCount = count;
    } catch {
      // tabla puede no existir en todos los envs
    }

    rows.push({
      check_category: "proto_counts",
      check_name: "record_totals",
      status: "info",
      value: `invoices=${invoiceCount ?? "?"} receipts=${receiptCount ?? "?"} companies=${companyCount ?? "?"}`,
      detail: `shadows=${shadowCount ?? "?"} installments=${installmentCount ?? "?"}`,
      workspace_company_id: wid,
    });

    // VARIOS receipts
    const { data: receipts } = await sb
      .from("proto_receipts")
      .select("id, zeta_metadata")
      .eq("workspace_company_id", wid)
      .limit(5000);

    let variosCount = 0;
    for (const r of receipts ?? []) {
      const meta = r.zeta_metadata as Record<string, unknown> | null;
      const cc =
        (meta?.["cliente_codigo"] as string | undefined) ??
        (meta?.["ClienteCodigo"] as string | undefined) ??
        null;
      if (!cc || zetaReciboIsVarios(cc)) variosCount++;
    }

    if (variosCount > 0) {
      rows.push({
        check_category: "proto_counts",
        check_name: "receipts_varios_pending_review",
        status: "warning",
        value: String(variosCount),
        detail: `${variosCount} recibo(s) con ClienteCodigo VARIOS o sin cliente asignado — requieren revisión manual`,
        workspace_company_id: wid,
      });
    } else {
      rows.push({
        check_category: "proto_counts",
        check_name: "receipts_varios_pending_review",
        status: "ok",
        value: "0",
        detail: "Sin recibos VARIOS pendientes",
        workspace_company_id: wid,
      });
    }

    // Shadow duplicates check
    const { data: allInvoices } = await sb
      .from("proto_invoices")
      .select("id, category, zeta_metadata")
      .eq("workspace_company_id", wid)
      .limit(10000);

    const ccv1RegistroIds = new Set<string>();
    for (const inv of allInvoices ?? []) {
      if ((inv.category as string) !== "Zeta / saldos pendientes") {
        const meta = inv.zeta_metadata as Record<string, unknown> | null;
        const ccv1 = meta?.["zeta_customer_voucher_v1"] as Record<string, unknown> | undefined;
        const rid =
          (ccv1?.zeta_registro_id as string | undefined) ??
          (meta?.["zeta_comprobante_identity_v1"] as Record<string, unknown> | undefined)?.registro_id as string | undefined ??
          null;
        if (rid) ccv1RegistroIds.add(String(rid).trim());
      }
    }

    let shadowDupCount = 0;
    for (const inv of allInvoices ?? []) {
      if ((inv.category as string) === "Zeta / saldos pendientes") {
        const meta = inv.zeta_metadata as Record<string, unknown> | null;
        const rid =
          ((meta?.["zeta_customer_voucher_v1"] as Record<string, unknown> | undefined)?.zeta_registro_id as string | undefined) ??
          null;
        if (rid && ccv1RegistroIds.has(String(rid).trim())) {
          shadowDupCount++;
        }
      }
    }

    if (shadowDupCount > 0) {
      rows.push({
        check_category: "proto_counts",
        check_name: "shadow_duplicates",
        status: "warning",
        value: String(shadowDupCount),
        detail: `${shadowDupCount} saldo(s) pendiente(s) con RegistroId idéntico a CCV1 — posible duplicado shadow`,
        workspace_company_id: wid,
      });
    } else {
      rows.push({
        check_category: "proto_counts",
        check_name: "shadow_duplicates",
        status: "ok",
        value: "0",
        detail: "Sin shadows duplicados detectados",
        workspace_company_id: wid,
      });
    }

    // Clientes sin empresa local
    const { data: companies } = await sb
      .from("proto_companies")
      .select("external_id")
      .eq("workspace_company_id", wid)
      .limit(5000);

    const knownCodigos = new Set(
      (companies ?? [])
        .map((c: { external_id: string | null }) => c.external_id?.trim() ?? "")
        .filter((s) => s.length > 0)
    );

    const { data: invoiceSample } = await sb
      .from("proto_invoices")
      .select("id, zeta_metadata")
      .eq("workspace_company_id", wid)
      .neq("category", "Zeta / saldos pendientes")
      .limit(5000);

    const unmatchedCodigos = new Set<string>();
    for (const inv of invoiceSample ?? []) {
      const meta = inv.zeta_metadata as Record<string, unknown> | null;
      const ccv1 = meta?.["zeta_customer_voucher_v1"] as Record<string, unknown> | undefined;
      const clienteCodigo = (ccv1?.zeta_cliente_codigo as string | undefined)?.trim() ?? null;
      if (clienteCodigo && !knownCodigos.has(clienteCodigo) && !zetaReciboIsVarios(clienteCodigo)) {
        unmatchedCodigos.add(clienteCodigo);
      }
    }

    if (unmatchedCodigos.size > 0) {
      rows.push({
        check_category: "proto_counts",
        check_name: "unmatched_cliente_codigo",
        status: "warning",
        value: String(unmatchedCodigos.size),
        detail: `ClienteCodigos sin empresa local: ${[...unmatchedCodigos].slice(0, 10).join(", ")}`,
        workspace_company_id: wid,
      });
    } else {
      rows.push({
        check_category: "proto_counts",
        check_name: "unmatched_cliente_codigo",
        status: "ok",
        value: "0",
        detail: "Todos los ClienteCodigos tienen empresa local",
        workspace_company_id: wid,
      });
    }
  }

  return rows;
}

// ── Currency breakdown ────────────────────────────────────────────────────────

async function checkCurrencyBreakdown(workspaceIds: string[]): Promise<HealthRow[]> {
  const rows: HealthRow[] = [];

  for (const wid of workspaceIds) {
    const { data: currencyData } = await sb
      .from("proto_invoices")
      .select("currency_code")
      .eq("workspace_company_id", wid)
      .neq("category", "Zeta / saldos pendientes")
      .limit(10000);

    const counts: Record<string, number> = {};
    let nullCurrency = 0;
    for (const row of currencyData ?? []) {
      const c = (row.currency_code as string | null) ?? null;
      if (!c) {
        nullCurrency++;
      } else {
        counts[c] = (counts[c] ?? 0) + 1;
      }
    }

    rows.push({
      check_category: "currency_breakdown",
      check_name: "invoices_by_currency",
      status: nullCurrency > 0 ? "warning" : "info",
      value: Object.entries(counts)
        .map(([k, v]) => `${k}=${v}`)
        .join(" "),
      detail:
        nullCurrency > 0
          ? `${nullCurrency} facturas sin currency_code — ejecutar currency enrichment`
          : "Todas las facturas tienen currency_code",
      workspace_company_id: wid,
    });
  }

  return rows;
}

// ── Skipped vouchers (from pipeline_runs metadata) ───────────────────────────

async function checkSkippedVouchers(): Promise<HealthRow[]> {
  const rows: HealthRow[] = [];

  // Look for last VOUCHERS run with skip info in metadata
  const { data } = await sb
    .from("zeta_pipeline_runs")
    .select("id, started_at, status, rows_processed, rows_failed, metadata, error_summary")
    .eq("pipeline_name", ZETA_PIPELINE_NAMES.VOUCHERS)
    .order("started_at", { ascending: false })
    .limit(5);

  for (const run of (data ?? []) as {
    id: string;
    started_at: string;
    status: string;
    rows_processed: number;
    rows_failed: number;
    metadata: Record<string, unknown> | null;
    error_summary: string | null;
  }[]) {
    const meta = run.metadata as Record<string, unknown> | null;
    const skippedClassifier =
      typeof meta?.rows_skipped_classifier === "number"
        ? meta.rows_skipped_classifier
        : typeof meta?.skipped_classifier === "number"
        ? meta.skipped_classifier
        : null;

    if (skippedClassifier !== null && skippedClassifier > 0) {
      rows.push({
        check_category: "voucher_classifier",
        check_name: "skipped_by_classifier",
        status: "info",
        value: String(skippedClassifier),
        detail: `run=${run.id} at=${run.started_at} processed=${run.rows_processed} — ${skippedClassifier} skippados (recibo/CFE no-DGI)`,
        workspace_company_id: "fleet",
      });
      break;
    }
  }

  return rows;
}

// ── Last cron errors ──────────────────────────────────────────────────────────

async function checkLastCronErrors(): Promise<HealthRow[]> {
  const rows: HealthRow[] = [];

  const { data } = await sb
    .from("zeta_pipeline_runs")
    .select("id, pipeline_name, started_at, status, error_summary")
    .in("status", ["failed", "partial"])
    .order("started_at", { ascending: false })
    .limit(20);

  for (const run of (data ?? []) as {
    id: string;
    pipeline_name: string;
    started_at: string;
    status: string;
    error_summary: string | null;
  }[]) {
    rows.push({
      check_category: "cron_errors",
      check_name: run.pipeline_name,
      status: run.status === "failed" ? "error" : "warning",
      value: run.status,
      detail: `at=${run.started_at} err=${(run.error_summary ?? "sin detalle").slice(0, 100)}`,
      workspace_company_id: "fleet",
    });
  }

  return rows;
}

// ── CSV output ────────────────────────────────────────────────────────────────

function escapeCsv(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeCsv(rows: HealthRow[], filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const header =
    "check_category,check_name,status,value,detail,workspace_company_id";
  const lines = rows.map((r) =>
    [
      r.check_category,
      r.check_name,
      r.status,
      r.value,
      r.detail,
      r.workspace_company_id,
    ]
      .map(escapeCsv)
      .join(",")
  );

  fs.writeFileSync(filePath, [header, ...lines].join("\n") + "\n", "utf-8");
}

// ── Summary ───────────────────────────────────────────────────────────────────

function printSummary(rows: HealthRow[]): void {
  const errors = rows.filter((r) => r.status === "error");
  const warnings = rows.filter((r) => r.status === "warning");
  const oks = rows.filter((r) => r.status === "ok");

  console.log(`\n${"─".repeat(60)}`);
  console.log(`ZETA SYNC HEALTH — ${new Date().toISOString()}`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  errors:   ${errors.length}`);
  console.log(`  warnings: ${warnings.length}`);
  console.log(`  ok:       ${oks.length}`);
  console.log(`  info:     ${rows.filter((r) => r.status === "info").length}`);
  console.log(`${"─".repeat(60)}`);

  if (errors.length > 0) {
    console.log("\n🔴 ERRORS:");
    for (const r of errors) {
      console.log(
        `  [${r.check_category}] ${r.check_name}: ${r.value} — ${r.detail}`
      );
    }
  }

  if (warnings.length > 0) {
    console.log("\n🟡 WARNINGS:");
    for (const r of warnings) {
      console.log(
        `  [${r.check_category}] ${r.check_name}: ${r.value} — ${r.detail}`
      );
    }
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log("\n✓ Sync health: OK — sin errores ni advertencias.");
  }

  console.log(`\n[audit] Output: ${outputPath}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[audit:zeta-sync-health] Iniciando auditoría de sincronización Zeta…");

  const workspaceIds = await resolveWorkspaceIds();
  if (workspaceIds.length === 0) {
    console.warn("[warn] No se encontraron workspaces para auditar.");
    process.exit(0);
  }

  console.log(
    `[audit] ${workspaceIds.length} workspace(s): ${workspaceIds
      .slice(0, 3)
      .join(", ")}${workspaceIds.length > 3 ? "…" : ""}`
  );

  const [pipelineRows, completenessRows, protoCountRows, currencyRows, skippedRows, cronErrorRows] =
    await Promise.all([
      checkPipelineHealth(),
      checkCompletenessAudits(workspaceIds),
      checkProtoCounts(workspaceIds),
      checkCurrencyBreakdown(workspaceIds),
      checkSkippedVouchers(),
      checkLastCronErrors(),
    ]);

  const allRows = [
    ...pipelineRows,
    ...completenessRows,
    ...protoCountRows,
    ...currencyRows,
    ...skippedRows,
    ...cronErrorRows,
  ];

  writeCsv(allRows, outputPath);
  printSummary(allRows);
}

main().catch((err) => {
  console.error("[audit:zeta-sync-health] Error fatal:", err);
  process.exit(1);
});
