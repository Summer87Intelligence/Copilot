/**
 * ZETA-08 Fase 0 — Diagnóstico de cobertura de cuotas (motor puro).
 *
 * Alimenta `diagnostics.installment_coverage` en financial-reconciliation.
 */

import {
  classifyInstallmentAgingRange,
  computeInstallmentAging,
  daysPastDueFromVencimiento,
  type InstallmentAgingInput,
} from "@/lib/copilot-installment-aging";
import type { InstallmentCoverageDiagnostics } from "@/lib/copilot-financial-reconciliation";

export type InstallmentCoverageInvoiceInput = {
  id: string;
  company_id: string | null;
  balance_amount: number | null;
  due_date: string | null;
  due_date_source: string | null;
  status: string | null;
};

export type InstallmentCoverageRowInput = {
  invoice_id: string | null;
  currency_code: string | null;
  cuota_saldo: number | null;
  cuota_total?: number | null;
  cuota_vencimiento: string | null;
};

const SALDO_EPSILON = 0.005;
const BALANCE_MISMATCH_EPSILON = 0.02;
const VOIDED = new Set(["void", "voided", "anulado", "anulada", "cancelled", "canceled"]);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function safeNum(v: number | null | undefined): number {
  if (v === null || v === undefined || !Number.isFinite(v)) return 0;
  return v;
}

function parseYmdToMs(s: string | null | undefined): number | null {
  const d = (s ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const ms = Date.parse(`${d}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

function isVoided(status: string | null | undefined): boolean {
  return VOIDED.has((status ?? "").trim().toLowerCase());
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return round2((numerator / denominator) * 100);
}

function isPendingInvoice(inv: InstallmentCoverageInvoiceInput): boolean {
  if (isVoided(inv.status)) return false;
  return round2(Math.max(0, safeNum(inv.balance_amount))) > SALDO_EPSILON;
}

function isOverdueByInvoiceDueDate(
  inv: InstallmentCoverageInvoiceInput,
  nowMs: number
): boolean {
  const dueMs = parseYmdToMs(inv.due_date);
  if (dueMs === null) return false;
  return dueMs < nowMs;
}

export function buildInstallmentCoverageDiagnostics(opts: {
  invoices: InstallmentCoverageInvoiceInput[];
  installments: InstallmentCoverageRowInput[];
  now?: string;
}): InstallmentCoverageDiagnostics {
  const nowMs = opts.now ? Date.parse(opts.now) : Date.now();
  const refMs = Number.isFinite(nowMs) ? nowMs : Date.now();

  const pendingInvoices = opts.invoices.filter(isPendingInvoice);
  const pendingInvoiceCount = pendingInvoices.length;

  let realDueDateInvoiceCount = 0;
  let syntheticDueDateInvoiceCount = 0;
  for (const inv of pendingInvoices) {
    const src = (inv.due_date_source ?? "").trim();
    if (src === "zeta_cuotas_v1") realDueDateInvoiceCount += 1;
    else if (src === "synthetic_30d") syntheticDueDateInvoiceCount += 1;
  }

  const coveragePct = pct(realDueDateInvoiceCount, pendingInvoiceCount);
  const syntheticPct = pct(syntheticDueDateInvoiceCount, pendingInvoiceCount);

  let orphanCount = 0;
  let linkedInstallmentCount = 0;
  for (const row of opts.installments) {
    const saldo = round2(Math.max(0, safeNum(row.cuota_saldo)));
    if (saldo <= SALDO_EPSILON) continue;
    if (row.invoice_id?.trim()) linkedInstallmentCount += 1;
    else orphanCount += 1;
  }

  const saldoByInvoice = new Map<string, number>();
  const installmentsByInvoice = new Map<string, InstallmentCoverageRowInput[]>();

  for (const row of opts.installments) {
    const invId = row.invoice_id?.trim();
    if (!invId) continue;
    const saldo = round2(Math.max(0, safeNum(row.cuota_saldo)));
    if (saldo <= SALDO_EPSILON) continue;
    saldoByInvoice.set(invId, round2((saldoByInvoice.get(invId) ?? 0) + saldo));
    const list = installmentsByInvoice.get(invId) ?? [];
    list.push(row);
    installmentsByInvoice.set(invId, list);
  }

  let minDateTrapCount = 0;
  let balanceMismatchCount = 0;
  let partialWithOverdueCount = 0;

  const pendingById = new Map(pendingInvoices.map((i) => [i.id, i]));

  for (const inv of pendingInvoices) {
    const rows = installmentsByInvoice.get(inv.id) ?? [];
    let hasOverdue = false;
    let hasFuture = false;
    for (const row of rows) {
      const days = daysPastDueFromVencimiento(row.cuota_vencimiento, refMs);
      if (days === null) {
        hasFuture = true;
        continue;
      }
      if (days > 0) hasOverdue = true;
      else hasFuture = true;
    }
    if (hasOverdue && hasFuture) minDateTrapCount += 1;

    const sumCuotas = saldoByInvoice.get(inv.id) ?? 0;
    const bal = round2(Math.max(0, safeNum(inv.balance_amount)));
    if (rows.length > 0 && Math.abs(sumCuotas - bal) > BALANCE_MISMATCH_EPSILON) {
      balanceMismatchCount += 1;
    }

    const status = (inv.status ?? "").trim().toLowerCase();
    if (status === "partial" && hasOverdue) partialWithOverdueCount += 1;
  }

  const agingInputs: InstallmentAgingInput[] = opts.installments.map((r) => ({
    invoice_id: r.invoice_id,
    currency_code: r.currency_code,
    cuota_saldo: r.cuota_saldo,
    cuota_total: r.cuota_total,
    cuota_vencimiento: r.cuota_vencimiento,
  }));
  const aging = computeInstallmentAging(agingInputs, opts.now);

  const installmentOverdueByCompany = new Map<string, number>();
  for (const row of opts.installments) {
    const invId = row.invoice_id?.trim();
    if (!invId) continue;
    const inv = pendingById.get(invId);
    if (!inv?.company_id) continue;
    const saldo = round2(Math.max(0, safeNum(row.cuota_saldo)));
    if (saldo <= SALDO_EPSILON) continue;
    const range = classifyInstallmentAgingRange(row.cuota_vencimiento, refMs);
    if (range === "current") continue;
    const cid = inv.company_id.trim();
    installmentOverdueByCompany.set(
      cid,
      round2((installmentOverdueByCompany.get(cid) ?? 0) + saldo)
    );
  }

  let underestimatedClientCount = 0;
  const clientsChecked = new Set<string>();
  for (const inv of pendingInvoices) {
    const cid = inv.company_id?.trim();
    if (!cid || clientsChecked.has(cid)) continue;
    clientsChecked.add(cid);

    const companyInvoices = pendingInvoices.filter((i) => i.company_id?.trim() === cid);
    const installmentOverdue = installmentOverdueByCompany.get(cid) ?? 0;
    if (installmentOverdue <= SALDO_EPSILON) continue;

    const anyInvoiceShowsOverdue = companyInvoices.some((i) =>
      isOverdueByInvoiceDueDate(i, refMs)
    );
    if (!anyInvoiceShowsOverdue) underestimatedClientCount += 1;
  }

  const noteParts: string[] = [];
  if (pendingInvoiceCount === 0) {
    noteParts.push("Sin facturas pendientes en el dataset.");
  }
  if (minDateTrapCount > 0) {
    noteParts.push(
      `${minDateTrapCount} factura(s) con cuotas vencidas y futuras (rollup min-date puede subestimar overdue).`
    );
  }
  if (orphanCount > 0) {
    noteParts.push(`${orphanCount} cuota(s) huérfana(s) sin invoice_id.`);
  }

  return {
    coveragePct,
    syntheticPct,
    orphanCount,
    minDateTrapCount,
    balanceMismatchCount,
    pendingInvoiceCount,
    realDueDateInvoiceCount,
    syntheticDueDateInvoiceCount,
    partialWithOverdueCount,
    underestimatedClientCount,
    installmentRowCount: opts.installments.length,
    linkedInstallmentCount,
    installmentAging: {
      dominantRange: aging.dominantRange,
      hasMixedAging: aging.hasMixedAging,
      overdueInstallments: aging.overdueInstallments,
      overdueInvoiceCount: aging.overdueInvoices.length,
    },
    note: noteParts.length > 0 ? noteParts.join(" ") : "Cobertura de cuotas dentro de parámetros esperados.",
  };
}

/** Default para scripts Node (`tsx` + `.mjs`): named ESM no se re-exportan desde `.ts`. */
export default {
  buildInstallmentCoverageDiagnostics,
};
