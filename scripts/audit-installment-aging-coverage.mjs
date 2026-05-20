#!/usr/bin/env node
/**
 * ZETA-08 Fase 0 — Auditoría read-only: cobertura de cuotas y traps de aging.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/audit-installment-aging-coverage.mjs
 *
 * Flags:
 *   --workspace UUID   (default: WORKSPACE_COMPANY_ID)
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKSPACE_COMPANY_ID
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import installmentCoverageModule from "../lib/copilot-installment-coverage.ts";
import installmentAgingModule from "../lib/copilot-installment-aging.ts";

const { buildInstallmentCoverageDiagnostics } = installmentCoverageModule;
const { computeInstallmentAging } = installmentAgingModule;

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const args = process.argv.slice(2);
function argFlag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? null : null;
}

const MIN_FINANCIAL_DATE = "2026-01-01";
const PAGE = 1000;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workspaceId =
  argFlag("--workspace") ??
  process.env.WORKSPACE_COMPANY_ID ??
  process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;

if (!url || !key || !workspaceId) {
  console.error("Falta SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o WORKSPACE_COMPANY_ID");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function fetchAll(table, buildQuery) {
  const rows = [];
  let from = 0;
  while (true) {
    const to = from + PAGE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function num(v) {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const now = new Date().toISOString();
  console.log("=== ZETA-08 Installment aging coverage audit ===");
  console.log({ workspaceId, now });

  let invoices;
  let installments;
  try {
    [invoices, installments] = await Promise.all([
      fetchAll("proto_invoices", (from, to) =>
        supabase
          .from("proto_invoices")
          .select(
            "id, company_id, balance_amount, due_date, due_date_source, status, currency_code"
          )
          .eq("workspace_company_id", workspaceId)
          .eq("is_active", true)
          .gte("issue_date", MIN_FINANCIAL_DATE)
          .order("id", { ascending: true })
          .range(from, to)
      ),
      fetchAll("proto_invoice_installments", (from, to) =>
        supabase
          .from("proto_invoice_installments")
          .select(
            "id, invoice_id, zeta_registro_id, currency_code, cuota_saldo, cuota_total, cuota_vencimiento, cliente_codigo"
          )
          .eq("workspace_company_id", workspaceId)
          .order("cuota_vencimiento", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
      ),
    ]);
  } catch (e) {
    console.error("DB error:", e.message);
    if (String(e.message).includes("proto_invoice_installments")) {
      console.error(
        "La tabla proto_invoice_installments no existe. Aplicar supabase/zeta-08-01-proto-invoice-installments.sql"
      );
    }
    process.exit(1);
  }

  const invoiceInputs = invoices.map((r) => ({
    id: String(r.id),
    company_id: r.company_id != null ? String(r.company_id) : null,
    balance_amount: num(r.balance_amount),
    due_date: r.due_date != null ? String(r.due_date).slice(0, 10) : null,
    due_date_source: r.due_date_source != null ? String(r.due_date_source) : null,
    status: r.status != null ? String(r.status) : null,
  }));

  const installmentInputs = installments.map((r) => ({
    invoice_id: r.invoice_id != null ? String(r.invoice_id) : null,
    currency_code: r.currency_code != null ? String(r.currency_code) : null,
    cuota_saldo: num(r.cuota_saldo),
    cuota_total: num(r.cuota_total),
    cuota_vencimiento:
      r.cuota_vencimiento != null ? String(r.cuota_vencimiento).slice(0, 10) : null,
  }));

  const coverage = buildInstallmentCoverageDiagnostics({
    invoices: invoiceInputs,
    installments: installmentInputs,
    now,
  });

  const aging = computeInstallmentAging(
    installmentInputs.map((r) => ({
      invoice_id: r.invoice_id,
      currency_code: r.currency_code,
      cuota_saldo: r.cuota_saldo,
      cuota_total: r.cuota_total,
      cuota_vencimiento: r.cuota_vencimiento,
    })),
    now
  );

  const traps = [];
  if (coverage.minDateTrapCount > 0) {
    traps.push({
      kind: "min_date_trap",
      count: coverage.minDateTrapCount,
      hint: "due_date rollup = min(cuota) puede ocultar cuotas vencidas",
    });
  }
  if (coverage.balanceMismatchCount > 0) {
    traps.push({
      kind: "balance_vs_cuotas",
      count: coverage.balanceMismatchCount,
      hint: "Σ cuota_saldo ≠ balance_amount en factura",
    });
  }
  if (coverage.underestimatedClientCount > 0) {
    traps.push({
      kind: "underestimated_overdue_clients",
      count: coverage.underestimatedClientCount,
      hint: "overdue real por cuota > overdue por due_date rollup",
    });
  }
  if (coverage.orphanCount > 0) {
    traps.push({
      kind: "orphan_installments",
      count: coverage.orphanCount,
      hint: "cuotas sin invoice_id — no actualizan due_date",
    });
  }

  const report = {
    diagnostics: {
      installment_coverage: {
        coveragePct: coverage.coveragePct,
        syntheticPct: coverage.syntheticPct,
        orphanCount: coverage.orphanCount,
        minDateTrapCount: coverage.minDateTrapCount,
        balanceMismatchCount: coverage.balanceMismatchCount,
      },
    },
    detail: coverage,
    installment_aging_shadow: aging,
    traps,
    row_counts: {
      invoices_loaded: invoices.length,
      installments_loaded: installments.length,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  const risks = [];
  if (coverage.coveragePct < 90) {
    risks.push(`Cobertura due real baja (${coverage.coveragePct}% < 90%) — correr cron cuotas / backfill`);
  }
  if (coverage.minDateTrapCount > 0) {
    risks.push(`${coverage.minDateTrapCount} factura(s) en min-date trap — Fase 2 aging por cuota recomendado`);
  }
  if (coverage.balanceMismatchCount > 0) {
    risks.push(`${coverage.balanceMismatchCount} mismatch balance vs cuotas — revisar vouchers/saldos`);
  }

  if (risks.length > 0) {
    console.log("\n--- Riesgos detectados ---");
    for (const r of risks) console.log(`- ${r}`);
  } else {
    console.log("\n--- Sin riesgos críticos en umbrales por defecto ---");
  }

  console.log("\n--- Siguiente fase recomendada ---");
  console.log(
    "Fase 2: exponer installment aging en cartera (shadow → switch) cuando coveragePct ≥ 90 y traps auditados."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
