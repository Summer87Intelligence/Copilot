/**
 * ZETA-08 Fase 2 — Observation layer: shadow aging diagnostics para GO/NO-GO.
 *
 * Motor puro, sin I/O. Toma el resultado del shadow aging y produce:
 *   - top_underestimated_clients: clientes donde installment detecta más overdue que legacy.
 *   - hidden_overdue_summary: overdue oculto por moneda con conteo de clientes/facturas afectadas.
 *   - switch_readiness: score y recomendación GO/NO-GO para activar aging por cuota en producción.
 *
 * NO modifica ningún campo visible en UI. Solo alimenta `diagnostics`.
 */

import { classifyInstallmentAgingRange } from "@/lib/copilot-installment-aging";
import type {
  CompanyInput,
  InstallmentCoverageDiagnostics,
  ReconciliationCurrencyCode,
} from "@/lib/copilot-financial-reconciliation";
import type { AgingComparativeDiagnostics } from "@/lib/copilot-installment-aging-delta";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type ObservationInstallmentInput = {
  invoice_id: string | null;
  currency_code: string | null;
  cuota_saldo: number | null;
  cuota_vencimiento: string | null;
};

export type ObservationInvoiceInput = {
  id: string;
  company_id: string | null;
  currency_code: string | null;
  balance_amount: number | null;
  status: string | null;
  due_date?: string | null;
  due_date_source?: string | null;
  issue_date?: string | null;
};

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** Cliente con installment overdue superior al estimado por el motor legacy. */
export type UnderestimatedClientEntry = {
  company_id: string;
  company_name: string | null;
  currency: ReconciliationCurrencyCode;
  legacy_overdue: number;
  installment_overdue: number;
  delta: number;
  pct_diff: number | null;
  mixed_aging: boolean;
  overdue_installments_count: number;
};

/** Resumen de overdue oculto por moneda. */
export type HiddenOverdueSummaryEntry = {
  currency: ReconciliationCurrencyCode;
  hidden_overdue_total: number;
  affected_clients: number;
  affected_invoices: number;
  partial_overdue_count: number;
};

/**
 * Evaluación GO/NO-GO para activar aging por cuota en producción.
 *
 * `ready`      — true si no hay blockers.
 * `blockers`   — condiciones que impiden el switch (datos críticos faltantes).
 * `warnings`   — riesgos que ameritan monitoreo previo al switch.
 * `confidence` — score 0-100 basado en cobertura, integridad y delta.
 */
export type SwitchReadiness = {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  confidence: number;
};

export type InstallmentAgingObservationDiagnostics = {
  top_underestimated_clients: UnderestimatedClientEntry[];
  hidden_overdue_summary: HiddenOverdueSummaryEntry[];
  switch_readiness: SwitchReadiness;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CURRENCIES: ReadonlyArray<ReconciliationCurrencyCode> = ["USD", "UYU"];
const SALDO_EPSILON = 0.005;
const DAY_MS = 86_400_000;
const VOIDED = new Set(["void", "voided", "anulado", "anulada", "cancelled", "canceled"]);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function safeNum(v: number | null | undefined): number {
  if (v === null || v === undefined || !Number.isFinite(v)) return 0;
  return v;
}

function parseYmd(s: string | null | undefined): number | null {
  const d = (s ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const ms = Date.parse(`${d}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

function isVoided(status: string | null | undefined): boolean {
  return VOIDED.has((status ?? "").trim().toLowerCase());
}

function isPending(inv: ObservationInvoiceInput): boolean {
  if (isVoided(inv.status)) return false;
  return round2(Math.max(0, safeNum(inv.balance_amount))) > SALDO_EPSILON;
}

/**
 * Clasifica el aging legacy de una factura: "current" (0_30) o "overdue" (31+).
 * Replica `resolveAging` del motor de reconciliación (privado — no reexportado).
 *
 * Retorna `false` si no hay fecha usable (tratado como current/indeterminado).
 */
function isLegacyOverdue(inv: ObservationInvoiceInput, nowMs: number): boolean {
  let refMs: number | null = null;

  if (inv.due_date_source === "zeta_cuotas_v1" && inv.due_date) {
    refMs = parseYmd(inv.due_date);
  }
  if (refMs === null && inv.issue_date) {
    // Synthetic: due_date ≡ issue_date (aging range is days-since-issue, not days-past-due+30).
    // "overdue" en legacy = días desde emisión > 30.
    refMs = parseYmd(inv.issue_date);
  }

  if (refMs === null) return false;

  // Para due_date real: días de mora desde vencimiento.
  // Para issue_date sintético: días desde emisión (el motor legacy usa días desde emisión directamente).
  const days = Math.floor((nowMs - refMs) / DAY_MS);
  return days > 30;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export function buildInstallmentAgingObservation(opts: {
  installments: ObservationInstallmentInput[];
  invoices: ObservationInvoiceInput[];
  companies: CompanyInput[];
  agingComparative: AgingComparativeDiagnostics;
  installmentCoverage?: InstallmentCoverageDiagnostics;
  now?: string;
  topN?: number;
}): InstallmentAgingObservationDiagnostics {
  const nowMs = opts.now ? Date.parse(opts.now) : Date.now();
  const refMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const topN = opts.topN ?? 10;

  // --- Build lookup maps ---

  const companyNameById = new Map<string, string | null>();
  for (const c of opts.companies) {
    companyNameById.set(c.id.trim(), c.name ?? null);
  }

  const pendingInvoiceById = new Map<string, ObservationInvoiceInput>();
  for (const inv of opts.invoices) {
    if (isPending(inv)) pendingInvoiceById.set(inv.id.trim(), inv);
  }

  // --- Per-invoice installment stats ---

  // key = `${company_id}|${currency}`
  type Key = string;
  const installmentOverdueByKey = new Map<Key, number>();
  const overdueInstallmentCountByKey = new Map<Key, number>();
  const invoiceCurrencyByInvId = new Map<string, ReconciliationCurrencyCode>();

  // For partial overdue (hasCurrent AND hasOverdue per invoice)
  const perInvoiceHasCurrent = new Map<string, boolean>();
  const perInvoiceHasOverdue = new Map<string, boolean>();

  // Affected invoice_ids per currency
  const overdueInvoicesByCurrency = new Map<ReconciliationCurrencyCode, Set<string>>();

  for (const row of opts.installments) {
    const invId = row.invoice_id?.trim();
    if (!invId) continue;

    const saldo = round2(Math.max(0, safeNum(row.cuota_saldo)));
    if (saldo <= SALDO_EPSILON) continue;

    const inv = pendingInvoiceById.get(invId);
    if (!inv) continue;

    const cid = inv.company_id?.trim();
    if (!cid) continue;

    const rawCc = (row.currency_code ?? inv.currency_code ?? "").trim().toUpperCase();
    if (rawCc !== "USD" && rawCc !== "UYU") continue;
    const cc = rawCc as ReconciliationCurrencyCode;

    invoiceCurrencyByInvId.set(invId, cc);

    const range = classifyInstallmentAgingRange(row.cuota_vencimiento, refMs);
    const key: Key = `${cid}|${cc}`;

    if (range === "current") {
      perInvoiceHasCurrent.set(invId, true);
    } else {
      perInvoiceHasOverdue.set(invId, true);
      installmentOverdueByKey.set(key, round2((installmentOverdueByKey.get(key) ?? 0) + saldo));
      overdueInstallmentCountByKey.set(key, (overdueInstallmentCountByKey.get(key) ?? 0) + 1);

      if (!overdueInvoicesByCurrency.has(cc)) overdueInvoicesByCurrency.set(cc, new Set());
      overdueInvoicesByCurrency.get(cc)!.add(invId);
    }
  }

  // --- Partial overdue (mixed aging) per company per currency ---
  const mixedAgingByCompany = new Map<string, boolean>();
  const partialOverdueInvoicesByCurrency = new Map<ReconciliationCurrencyCode, Set<string>>();

  for (const [invId] of perInvoiceHasOverdue) {
    if (!perInvoiceHasCurrent.get(invId)) continue;
    const inv = pendingInvoiceById.get(invId);
    if (!inv?.company_id) continue;
    const cid = inv.company_id.trim();
    mixedAgingByCompany.set(cid, true);
    const cc = invoiceCurrencyByInvId.get(invId);
    if (cc) {
      if (!partialOverdueInvoicesByCurrency.has(cc))
        partialOverdueInvoicesByCurrency.set(cc, new Set());
      partialOverdueInvoicesByCurrency.get(cc)!.add(invId);
    }
  }

  // --- Per-invoice legacy overdue (by company + currency) ---
  const legacyOverdueByKey = new Map<Key, number>();

  for (const inv of pendingInvoiceById.values()) {
    const cid = inv.company_id?.trim();
    if (!cid) continue;
    const rawCc = (inv.currency_code ?? "").trim().toUpperCase();
    if (rawCc !== "USD" && rawCc !== "UYU") continue;
    const cc = rawCc as ReconciliationCurrencyCode;
    if (!isLegacyOverdue(inv, refMs)) continue;

    const bal = round2(Math.max(0, safeNum(inv.balance_amount)));
    if (bal <= SALDO_EPSILON) continue;

    const key: Key = `${cid}|${cc}`;
    legacyOverdueByKey.set(key, round2((legacyOverdueByKey.get(key) ?? 0) + bal));
  }

  // --- 1. Top underestimated clients ---

  // Collect all (company, currency) keys with installment overdue data
  const allKeys = new Set<Key>([
    ...installmentOverdueByKey.keys(),
  ]);

  const underestimatedEntries: UnderestimatedClientEntry[] = [];

  for (const key of allKeys) {
    const [cid, cc] = key.split("|") as [string, ReconciliationCurrencyCode];

    const installmentOverdue = installmentOverdueByKey.get(key) ?? 0;
    const legacyOverdue = legacyOverdueByKey.get(key) ?? 0;
    const delta = round2(installmentOverdue - legacyOverdue);

    if (delta <= SALDO_EPSILON && installmentOverdue <= SALDO_EPSILON) continue;

    const pctDiff =
      legacyOverdue > SALDO_EPSILON ? round2(delta / legacyOverdue) : null;

    underestimatedEntries.push({
      company_id: cid,
      company_name: companyNameById.get(cid) ?? null,
      currency: cc,
      legacy_overdue: legacyOverdue,
      installment_overdue: installmentOverdue,
      delta,
      pct_diff: pctDiff,
      mixed_aging: mixedAgingByCompany.get(cid) ?? false,
      overdue_installments_count: overdueInstallmentCountByKey.get(key) ?? 0,
    });
  }

  // Sort by delta desc (highest hidden risk first), then by installment_overdue desc
  underestimatedEntries.sort((a, b) => {
    const dDiff = b.delta - a.delta;
    if (Math.abs(dDiff) > SALDO_EPSILON) return dDiff;
    return b.installment_overdue - a.installment_overdue;
  });

  const topUnderestimatedClients = underestimatedEntries.slice(0, topN);

  // --- 2. Hidden overdue summary by currency ---

  const hiddenOverdueSummary: HiddenOverdueSummaryEntry[] = [];

  for (const cc of CURRENCIES) {
    const deltaByCurrency = opts.agingComparative.installment_vs_legacy_delta.byCurrency.find(
      (d) => d.currency === cc
    );
    if (!deltaByCurrency) continue;

    const hiddenOverdueTotal = deltaByCurrency.hidden_overdue;

    const affectedClientsSet = new Set<string>();
    for (const entry of underestimatedEntries) {
      if (entry.currency === cc && entry.delta > SALDO_EPSILON) {
        affectedClientsSet.add(entry.company_id);
      }
    }

    const affectedInvoices = overdueInvoicesByCurrency.get(cc)?.size ?? 0;
    const partialOverdueCount = partialOverdueInvoicesByCurrency.get(cc)?.size ?? 0;

    if (
      hiddenOverdueTotal > SALDO_EPSILON ||
      affectedInvoices > 0
    ) {
      hiddenOverdueSummary.push({
        currency: cc,
        hidden_overdue_total: hiddenOverdueTotal,
        affected_clients: affectedClientsSet.size,
        affected_invoices: affectedInvoices,
        partial_overdue_count: partialOverdueCount,
      });
    }
  }

  // --- 3. Switch readiness ---

  const blockers: string[] = [];
  const warnings: string[] = [];

  const coverage = opts.installmentCoverage;
  const delta = opts.agingComparative.installment_vs_legacy_delta;

  if (coverage) {
    if (coverage.orphanCount > 0) {
      blockers.push(
        `orphanCount=${coverage.orphanCount}: cuotas sin invoice_id impiden aging preciso.`
      );
    }
    if (coverage.coveragePct < 95) {
      blockers.push(
        `coveragePct=${coverage.coveragePct}%: menos del 95% de facturas tienen due_date real (zeta_cuotas_v1).`
      );
    }
    if (coverage.balanceMismatchCount > 0) {
      blockers.push(
        `balanceMismatchCount=${coverage.balanceMismatchCount}: saldo de cuotas no coincide con balance_amount de factura.`
      );
    }
    if (coverage.minDateTrapCount > 0) {
      warnings.push(
        `minDateTrapCount=${coverage.minDateTrapCount}: facturas con cuotas vencidas y futuras — min(due_date) subestima overdue real.`
      );
    }
  }

  if (delta.recommendation === "monitor") {
    warnings.push(
      `Divergencia de overdue excesiva: ${delta.total_hidden_overdue.toFixed(2)} oculto (> 5% del pendiente legacy). Investigar antes del switch.`
    );
  }

  const mixedAgingRatio =
    coverage && coverage.pendingInvoiceCount > 0
      ? delta.mixed_aging_invoice_count / coverage.pendingInvoiceCount
      : 0;
  if (mixedAgingRatio > 0.15) {
    warnings.push(
      `mixed_aging_invoice_count=${delta.mixed_aging_invoice_count} (${Math.round(mixedAgingRatio * 100)}% de facturas pendientes): alto porcentaje de cuotas con aging mixto.`
    );
  }

  if (delta.overdue_invoice_count > 0 && delta.any_underestimated) {
    warnings.push(
      `${delta.overdue_invoice_count} factura(s) con overdue por cuota no reflejado en el motor legacy.`
    );
  }

  // Confidence: 100 − penalizaciones
  let confidence = 100;

  if (coverage) {
    // Coverage penalty: cada punto por debajo de 100 descuenta 0.3 (max -30)
    const coveragePenalty = Math.min(30, Math.round((100 - coverage.coveragePct) * 0.3));
    confidence -= coveragePenalty;
  }

  for (const _ of blockers) {
    confidence -= 25;
  }
  for (const _ of warnings) {
    confidence -= 8;
  }

  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  const switchReadiness: SwitchReadiness = {
    ready: blockers.length === 0,
    blockers,
    warnings,
    confidence,
  };

  return {
    top_underestimated_clients: topUnderestimatedClients,
    hidden_overdue_summary: hiddenOverdueSummary,
    switch_readiness: switchReadiness,
  };
}
