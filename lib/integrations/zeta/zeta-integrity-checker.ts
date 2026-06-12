/**
 * ZETA-13: Data Integrity Checker.
 *
 * Verifica la integridad cruzada de los datos financieros locales.
 * SOLO accede a Supabase — no llama a Zeta.
 *
 * Checks implementados:
 *
 * INVOICES:
 * - balance_exceeds_total: balance_amount > total_amount (imposible contablemente)
 * - null_currency: invoice Zeta sin currency_code (enriquecimiento fallido)
 * - null_balance_pending: factura Zeta pendiente sin balance_amount actualizado
 * - duplicate_number: mismo invoice_number en dos registros activos del mismo workspace
 *
 * RECEIPTS:
 * - null_currency: recibo Zeta sin currency_code
 * - negative_or_zero_amount: monto <= 0 en recibo activo
 *
 * INSTALLMENTS:
 * - orphan_no_invoice: cuota sin invoice_id enlazado (>24h desde creación)
 * - overdue_invoice_open: cuota vencida hace >30d cuya factura sigue "pending"
 *
 * Todos los checks son read-only e idempotentes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntegrityCheckRunResult, IntegrityViolation } from "@/lib/integrations/zeta/zeta-enterprise-sync-types";
import {
  resolveStaleIntegrityViolations,
  upsertIntegrityViolation,
} from "@/lib/data/zeta-enterprise-sync-repository";
import { findActiveShadowDuplicatesInPeriod } from "@/lib/integrations/zeta/zeta-shadow-uniqueness-detector";

type CheckResult = {
  violations: IntegrityViolation[];
  error?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max rows scanned per workspace in financial integrity checks. Must stay >= ROW_CAP (5000). */
export const INTEGRITY_CHECK_INVOICE_LIMIT = 5000;

// ── Invoice Checks ────────────────────────────────────────────────────────────

/**
 * Monetary epsilon for balance vs total comparison.
 * Absorbs floating-point rounding drift from Zeta (e.g. 96624 vs 96623.88 = 0.12 diff).
 * 1.00 is safe: any real accounting error exceeds one monetary unit.
 */
const BALANCE_EPSILON = 1.00;

async function checkInvoiceBalanceExceedsTotal(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<CheckResult> {
  const { data, error } = await supabase
    .from("proto_invoices")
    .select("id, invoice_number, total_amount, balance_amount")
    .eq("workspace_company_id", workspaceId)
    .like("invoice_number", "ZETA:%")
    .eq("is_active", true)
    .not("total_amount", "is", null)
    .not("balance_amount", "is", null)
    .gt("balance_amount", 0) // Solo pendientes
    .limit(INTEGRITY_CHECK_INVOICE_LIMIT);

  if (error) return { violations: [], error: error.message };

  const violations: IntegrityViolation[] = [];
  for (const row of data ?? []) {
    const total = Number(row.total_amount);
    const balance = Number(row.balance_amount);
    const diff = balance - total;
    if (diff > BALANCE_EPSILON) {
      violations.push({
        check_name: "invoice_balance_exceeds_total",
        entity: "invoices",
        record_id: row.id as string,
        record_key: row.invoice_number as string,
        description: `balance_amount (${balance}) supera total_amount (${total}) en ${diff.toFixed(2)} — excede tolerancia monetaria (ε=${BALANCE_EPSILON})`,
        severity: "critical",
        metadata: { total_amount: total, balance_amount: balance, raw_difference: diff, epsilon_used: BALANCE_EPSILON },
      });
    }
  }
  return { violations };
}

async function checkInvoiceNullCurrency(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<CheckResult> {
  const { data, error } = await supabase
    .from("proto_invoices")
    .select("id, invoice_number")
    .eq("workspace_company_id", workspaceId)
    .like("invoice_number", "ZETA:%")
    .eq("is_active", true)
    .is("currency_code", null)
    .limit(200);

  if (error) return { violations: [], error: error.message };

  return {
    violations: (data ?? []).map((row) => ({
      check_name: "invoice_null_currency",
      entity: "invoices" as const,
      record_id: row.id as string,
      record_key: row.invoice_number as string,
      description: "Factura Zeta sin currency_code — enriquecimiento de moneda falló o está pendiente",
      severity: "warning" as const,
    })),
  };
}

async function checkInvoiceNullBalancePending(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<CheckResult> {
  // Facturas Zeta en estado pending sin balance_amount (nunca actualizadas por saldos cron)
  // Umbral: creadas hace más de 6h (tiempo razonable para que el cron las actualice)
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1_000).toISOString();

  const { data, error } = await supabase
    .from("proto_invoices")
    .select("id, invoice_number, created_at")
    .eq("workspace_company_id", workspaceId)
    .like("invoice_number", "ZETA:%")
    .eq("is_active", true)
    .eq("status", "pending")
    .is("balance_amount", null)
    .lt("created_at", cutoff)
    .limit(200);

  if (error) return { violations: [], error: error.message };

  return {
    violations: (data ?? []).map((row) => ({
      check_name: "invoice_null_balance_pending",
      entity: "invoices" as const,
      record_id: row.id as string,
      record_key: row.invoice_number as string,
      description: "Factura Zeta pendiente sin balance_amount — saldos cron no procesó este cliente",
      severity: "warning" as const,
      metadata: { created_at: row.created_at },
    })),
  };
}

async function checkInvoiceDuplicateNumber(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<CheckResult> {
  // Buscar invoice_numbers que aparecen más de una vez en registros activos
  const { data, error } = await supabase
    .rpc("find_duplicate_invoice_numbers", { p_workspace_id: workspaceId })
    .limit(50);

  // Si la RPC no existe (no migrada aún), fallback a query simple
  if (error) {
    // Fallback: query directa con group by (menos eficiente pero funciona)
    const { data: fallback, error: fbErr } = await supabase
      .from("proto_invoices")
      .select("invoice_number")
      .eq("workspace_company_id", workspaceId)
      .like("invoice_number", "ZETA:%")
      .eq("is_active", true)
      .limit(10000);

    if (fbErr) return { violations: [], error: fbErr.message };

    const seen = new Map<string, number>();
    for (const row of fallback ?? []) {
      const n = row.invoice_number as string;
      seen.set(n, (seen.get(n) ?? 0) + 1);
    }

    return {
      violations: [...seen.entries()]
        .filter(([, count]) => count > 1)
        .slice(0, 50)
        .map(([num, count]) => ({
          check_name: "invoice_duplicate_number",
          entity: "invoices" as const,
          record_key: num,
          description: `invoice_number duplicado: aparece ${count} veces en registros activos`,
          severity: "critical" as const,
          metadata: { count },
        })),
    };
  }

  return {
    violations: (data ?? []).map((row: Record<string, unknown>) => ({
      check_name: "invoice_duplicate_number",
      entity: "invoices" as const,
      record_key: String(row.invoice_number ?? ""),
      description: `invoice_number duplicado: aparece ${row.count} veces`,
      severity: "critical" as const,
      metadata: { count: row.count },
    })),
  };
}

/**
 * Ventana de scan para sombras Zeta vs CCV1: últimos 12 meses + futuro
 * cercano (cobertura de facturas con issue_date futura). El detector hace
 * un único pase de paginación por workspace; costo controlado para
 * 5000 filas/página × 100 páginas máx en `findActiveShadowDuplicatesInPeriod`.
 */
const SHADOW_SCAN_LOOKBACK_DAYS = 365;
const SHADOW_SCAN_LOOKAHEAD_DAYS = 30;

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Detecta sombras `ZETA:{RegistroId}` activas que tienen una CCV1 activa
 * gemela (mismo company / moneda / fecha / total ±0.20). Origen: pipeline
 * de saldos que no logró matchear contra una CCV1 ya persistida — caso
 * ZETA-08 cuando Zeta omite `RegistroId` del payload CCV1.
 *
 * Filas marcadas `review_required = true` en `zeta_metadata.cleanup_audit`
 * se reportan con severity `info` (visible pero no escalable). El resto
 * son `critical`: inflan `salesPeriod*` del motor financiero hasta que se
 * desactiven.
 */
async function checkInvoiceShadowDuplicateCcv1(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<CheckResult> {
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - SHADOW_SCAN_LOOKBACK_DAYS);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + SHADOW_SCAN_LOOKAHEAD_DAYS);

  const duplicates = await findActiveShadowDuplicatesInPeriod(supabase, workspaceId, {
    from: ymd(from),
    to: ymd(to),
  });

  if (duplicates.length === 0) return { violations: [] };

  const violations: IntegrityViolation[] = [];
  for (const d of duplicates.slice(0, 200)) {
    const matched = d.candidates[0];
    violations.push({
      check_name: "invoice_shadow_duplicate_ccv1",
      entity: "invoices",
      record_id: d.shadow_id,
      record_key: d.shadow_invoice_number,
      description: d.review_required
        ? `Sombra ZETA:{RegistroId} con CCV1 gemela activa — flag REVIEW_REQUIRED previo (cliente=${d.company_id} ${d.currency_code} ${d.total_amount} ${d.issue_date})`
        : `Sombra ZETA:{RegistroId} duplica CCV1 activa ${matched?.invoice_number ?? "?"} — ${d.currency_code} ${d.total_amount} ${d.issue_date}`,
      severity: d.review_required ? "info" : "critical",
      metadata: {
        currency_code: d.currency_code,
        total_amount: d.total_amount,
        issue_date: d.issue_date,
        company_id: d.company_id,
        candidate_count: d.candidates.length,
        matched_ccv1_invoice_number: matched?.invoice_number ?? null,
        matched_ccv1_invoice_id: matched?.invoice_id ?? null,
        review_required: d.review_required,
      },
    });
  }

  return { violations };
}

// ── Receipt Checks ────────────────────────────────────────────────────────────

async function checkReceiptNullCurrency(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<CheckResult> {
  const { data, error } = await supabase
    .from("proto_receipts")
    .select("id, receipt_number")
    .eq("workspace_company_id", workspaceId)
    .like("receipt_number", "ZETA:COB:%")
    .eq("is_active", true)
    .is("currency_code", null)
    .limit(200);

  if (error) return { violations: [], error: error.message };

  return {
    violations: (data ?? []).map((row) => ({
      check_name: "receipt_null_currency",
      entity: "receipts" as const,
      record_id: row.id as string,
      record_key: row.receipt_number as string,
      description: "Recibo Zeta sin currency_code",
      severity: "warning" as const,
    })),
  };
}

async function checkReceiptNegativeAmount(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<CheckResult> {
  const { data, error } = await supabase
    .from("proto_receipts")
    .select("id, receipt_number, amount")
    .eq("workspace_company_id", workspaceId)
    .like("receipt_number", "ZETA:COB:%")
    .eq("is_active", true)
    .lte("amount", 0)
    .limit(100);

  if (error) return { violations: [], error: error.message };

  return {
    violations: (data ?? []).map((row) => ({
      check_name: "receipt_negative_amount",
      entity: "receipts" as const,
      record_id: row.id as string,
      record_key: row.receipt_number as string,
      description: `Recibo Zeta con amount=${row.amount} (≤0 es inusual; puede indicar nota de crédito mal clasificada)`,
      severity: "info" as const,
      metadata: { amount: row.amount },
    })),
  };
}

// ── Additional Invoice / Receipt Checks ──────────────────────────────────────

async function checkInvoiceInvalidIssueDate(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<CheckResult> {
  const { data, error } = await supabase
    .from("proto_invoices")
    .select("id, invoice_number")
    .eq("workspace_company_id", workspaceId)
    .like("invoice_number", "ZETA:%")
    .eq("is_active", true)
    .is("issue_date", null)
    .limit(200);

  if (error) return { violations: [], error: error.message };

  return {
    violations: (data ?? []).map((row) => ({
      check_name: "invoice_invalid_issue_date",
      entity: "invoices" as const,
      record_id: row.id as string,
      record_key: row.invoice_number as string,
      description: "Factura Zeta con issue_date=NULL — campo FechaComprobante no mapeado correctamente",
      severity: "warning" as const,
    })),
  };
}

async function checkReceiptInvalidDate(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<CheckResult> {
  const { data, error } = await supabase
    .from("proto_receipts")
    .select("id, receipt_number")
    .eq("workspace_company_id", workspaceId)
    .like("receipt_number", "ZETA:COB:%")
    .eq("is_active", true)
    .is("receipt_date", null)
    .limit(200);

  if (error) return { violations: [], error: error.message };

  return {
    violations: (data ?? []).map((row) => ({
      check_name: "receipt_invalid_date",
      entity: "receipts" as const,
      record_id: row.id as string,
      record_key: row.receipt_number as string,
      description: "Recibo Zeta con receipt_date=NULL — campo FechaRecibo no mapeado correctamente",
      severity: "warning" as const,
    })),
  };
}

// ── Installment Checks ────────────────────────────────────────────────────────

async function checkInstallmentOrphanNoInvoice(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<CheckResult> {
  // Cuotas sin invoice_id enlazado creadas hace >24h
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();

  const { data, error } = await supabase
    .from("proto_invoice_installments")
    .select("id, zeta_registro_id, cuota_numero, synced_at")
    .eq("workspace_company_id", workspaceId)
    .is("invoice_id", null)
    .lt("synced_at", cutoff)
    .limit(200);

  if (error) {
    // Tabla puede no existir aún (ZETA-08 migrations pending)
    if (error.code === "42P01") return { violations: [] };
    return { violations: [], error: error.message };
  }

  return {
    violations: (data ?? []).map((row) => ({
      check_name: "installment_orphan_no_invoice",
      entity: "installments" as const,
      record_id: row.id as string,
      record_key: `${row.zeta_registro_id}:cuota${row.cuota_numero}`,
      description: `Cuota sin factura enlazada (>24h) — zeta_registro_id=${row.zeta_registro_id} no tiene match en proto_invoices`,
      severity: "warning" as const,
      metadata: { zeta_registro_id: row.zeta_registro_id, cuota_numero: row.cuota_numero },
    })),
  };
}

async function checkInstallmentOverdueInvoiceOpen(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<CheckResult> {
  // Cuotas con vencimiento >30 días atrás cuya factura linked aún dice "pending"
  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("proto_invoice_installments")
    .select("id, zeta_registro_id, cuota_numero, cuota_vencimiento, invoice_id, cuota_saldo")
    .eq("workspace_company_id", workspaceId)
    .not("invoice_id", "is", null)
    .lt("cuota_vencimiento", cutoffDate)
    .gt("cuota_saldo", 0)
    .limit(200);

  if (error) {
    if (error.code === "42P01") return { violations: [] };
    return { violations: [], error: error.message };
  }

  if ((data ?? []).length === 0) return { violations: [] };

  // Filtrar solo las que tienen invoice con status pending
  const invoiceIds = [...new Set((data ?? []).map((r) => r.invoice_id as string).filter(Boolean))];

  const { data: pendingInvoices } = await supabase
    .from("proto_invoices")
    .select("id")
    .in("id", invoiceIds)
    .eq("status", "pending")
    .eq("is_active", true);

  const pendingSet = new Set((pendingInvoices ?? []).map((r) => r.id as string));

  return {
    violations: (data ?? [])
      .filter((row) => pendingSet.has(row.invoice_id as string))
      .slice(0, 100)
      .map((row) => ({
        check_name: "installment_overdue_invoice_open",
        entity: "installments" as const,
        record_id: row.id as string,
        record_key: `${row.zeta_registro_id}:cuota${row.cuota_numero}`,
        description: `Cuota vencida desde ${row.cuota_vencimiento} con saldo pendiente — factura aún en status "pending" en local`,
        severity: "info" as const,
        metadata: {
          cuota_vencimiento: row.cuota_vencimiento,
          cuota_saldo: row.cuota_saldo,
          invoice_id: row.invoice_id,
        },
      })),
  };
}

// ── Orchestration ─────────────────────────────────────────────────────────────

type CheckDefinition = {
  name: string;
  entity: "invoices" | "receipts" | "installments";
  fn: (supabase: SupabaseClient, workspaceId: string) => Promise<CheckResult>;
};

const ALL_CHECKS: CheckDefinition[] = [
  { name: "invoice_balance_exceeds_total", entity: "invoices", fn: checkInvoiceBalanceExceedsTotal },
  { name: "invoice_null_currency", entity: "invoices", fn: checkInvoiceNullCurrency },
  { name: "invoice_null_balance_pending", entity: "invoices", fn: checkInvoiceNullBalancePending },
  { name: "invoice_duplicate_number", entity: "invoices", fn: checkInvoiceDuplicateNumber },
  { name: "invoice_shadow_duplicate_ccv1", entity: "invoices", fn: checkInvoiceShadowDuplicateCcv1 },
  { name: "invoice_invalid_issue_date", entity: "invoices", fn: checkInvoiceInvalidIssueDate },
  { name: "receipt_null_currency", entity: "receipts", fn: checkReceiptNullCurrency },
  { name: "receipt_negative_amount", entity: "receipts", fn: checkReceiptNegativeAmount },
  { name: "receipt_invalid_date", entity: "receipts", fn: checkReceiptInvalidDate },
  { name: "installment_orphan_no_invoice", entity: "installments", fn: checkInstallmentOrphanNoInvoice },
  { name: "installment_overdue_invoice_open", entity: "installments", fn: checkInstallmentOverdueInvoiceOpen },
];

/**
 * Ejecuta todos los checks de integridad para un workspace y persiste las violaciones.
 * Safe para ejecutar en paralelo con otros crons — solo lee y escribe zeta_integrity_violations.
 */
export async function runAllIntegrityChecks(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<IntegrityCheckRunResult[]> {
  const results: IntegrityCheckRunResult[] = [];

  for (const check of ALL_CHECKS) {
    const started = Date.now();
    let violationsFound = 0;
    let violationsNew = 0;
    let violationsResolved = 0;
    let violationsCritical = 0;
    let checkError: string | undefined;

    try {
      const { violations, error } = await check.fn(supabase, workspaceId);
      checkError = error;
      violationsFound = violations.length;
      violationsCritical = violations.filter((v) => v.severity === "critical").length;

      const foundKeys = new Set<string>();
      for (const violation of violations) {
        foundKeys.add(violation.record_id ?? violation.record_key ?? "NULL");
        const result = await upsertIntegrityViolation(supabase, workspaceId, violation);
        if (result?.isNew) violationsNew++;
      }

      violationsResolved = await resolveStaleIntegrityViolations(
        supabase, workspaceId, check.name, foundKeys
      );
    } catch (err) {
      checkError = String(err);
    }

    results.push({
      entity: check.entity,
      check_name: check.name,
      violations_found: violationsFound,
      violations_new: violationsNew,
      violations_resolved: violationsResolved,
      violations_critical: violationsCritical,
      duration_ms: Date.now() - started,
      error: checkError,
    });
  }

  return results;
}
