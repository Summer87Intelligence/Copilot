/**
 * FINANCIAL CANONICAL LAYER — Debt units (unidades vencibles).
 *
 * `buildCanonicalDebtUnits` es la fuente ÚNICA que convierte facturas + cuotas
 * en unidades vencibles atómicas. Todo cálculo de saldo pendiente / atrasado /
 * al día / aging debe derivar de estas unidades — Cliente 360, Cartera y Hoy no
 * deben expandir cuotas por su cuenta.
 *
 * Prioridad de vencimiento:
 *   1. cuota abierta de `proto_invoice_installments` (cuota_saldo > 0)
 *   2. vencimiento real de la factura (`due_date`)
 *   3. sin vencimiento confiable → unidad con `dueDate = null` (pendiente, NO
 *      atrasada) + diagnóstico `missing_due_date` / `invalid_due_date`.
 *
 * Reglas:
 *   - Si una factura tiene cuotas abiertas, el aging se calcula por cuota y NO
 *     se emite además la unidad de factura completa (sin doble conteo).
 *   - Una cuota pagada (saldo 0) no participa.
 *   - Si las cuotas abiertas no cubren el balance de la factura → diagnóstico
 *     `installment_balance_mismatch` (no se corrige el dato, no se oculta).
 *   - Nunca se inventa un vencimiento.
 *
 * El caller debe pasar facturas YA deduplicadas (shadow ↔ CCV1). Este builder
 * no dedupe: es responsabilidad del universo de entrada, igual que hoy.
 */

import { getDaysLate } from "@/lib/copilot/operating-aging";

import { normalizeCurrency, roundMoney } from "./currency";
import {
  classifyInvoice,
  safeNum,
  withinPeriod,
  ymd,
} from "./internal";
import type {
  CanonicalDebtDiagnostic,
  CanonicalDebtDiagnosticCode,
  CanonicalDebtUnit,
  CanonicalDebtUnitsResult,
  CanonicalFinancialContext,
  CanonicalInstallmentInput,
  CanonicalInvoiceInput,
  FinancialCurrency,
} from "./types";

const INSTALLMENT_MISMATCH_TOLERANCE = 0.5;
const OPEN_EPSILON = 0.005;

function emptyCounts(): Record<CanonicalDebtDiagnosticCode, number> {
  return {
    missing_currency: 0,
    missing_due_date: 0,
    invalid_due_date: 0,
    installment_balance_mismatch: 0,
    negative_open_balance: 0,
    invoice_without_company: 0,
  };
}

export interface BuildCanonicalDebtUnitsInput {
  invoices: readonly CanonicalInvoiceInput[];
  /** Cuotas (opcional). Se agrupan internamente por `invoice_id`. */
  installments?: readonly CanonicalInstallmentInput[];
  context: CanonicalFinancialContext;
  /**
   * Si `true`, NO aplica la ventana `[minFinancialDate, cutoff]` sobre
   * `issue_date` (incluye cualquier factura abierta, incluso sin issue_date).
   * Usado por consumidores cuyo universo ya está acotado aguas arriba
   * (p. ej. Cliente 360 filtra por cliente). Default `false`.
   */
  includeAllIssueDates?: boolean;
}

type OpenInstallment = {
  installmentId?: string;
  currency: FinancialCurrency | null;
  dueDate: string | null;
  dueDateRaw: string | null;
  openBalance: number;
};

/**
 * Construye las unidades vencibles canónicas al `cutoffDate` del contexto.
 * Solo incluye saldo abierto de facturas emitidas dentro de
 * `[minFinancialDate, cutoffDate]`, activas, no anuladas y no notas de crédito.
 */
export function buildCanonicalDebtUnits(
  input: BuildCanonicalDebtUnitsInput
): CanonicalDebtUnitsResult {
  const { invoices, installments = [], context, includeAllIssueDates = false } = input;
  const units: CanonicalDebtUnit[] = [];
  const diagnostics: CanonicalDebtDiagnostic[] = [];
  const diagnosticCounts = emptyCounts();

  const emit = (d: CanonicalDebtDiagnostic) => {
    diagnostics.push(d);
    diagnosticCounts[d.code] += 1;
  };

  // Agrupar cuotas ABIERTAS (cuota_saldo > 0) por invoice_id.
  const openInstallmentsByInvoice = new Map<string, OpenInstallment[]>();
  for (const raw of installments) {
    if (raw.is_active === false) continue;
    const invoiceId = raw.invoice_id != null ? String(raw.invoice_id).trim() : "";
    if (!invoiceId) continue;
    const open = roundMoney(Math.max(0, safeNum(raw.cuota_saldo)));
    if (!(open > OPEN_EPSILON)) continue; // cuota saldada no participa
    const dueRaw = raw.cuota_vencimiento != null ? String(raw.cuota_vencimiento) : null;
    const list = openInstallmentsByInvoice.get(invoiceId) ?? [];
    list.push({
      installmentId: raw.id != null ? String(raw.id) : undefined,
      currency: normalizeCurrency(raw.currency_code),
      dueDate: ymd(dueRaw),
      dueDateRaw: dueRaw,
      openBalance: open,
    });
    openInstallmentsByInvoice.set(invoiceId, list);
  }

  for (const inv of invoices) {
    const { normalized, unknownCurrency } = classifyInvoice(inv);
    const invoiceId = inv.id != null ? String(inv.id).trim() : "";

    if (unknownCurrency) {
      emit({ code: "missing_currency", invoiceId: invoiceId || "unknown" });
      continue;
    }
    if (normalized === null) continue; // inactiva / anulada / sin monto
    if (normalized.isCreditNote) continue; // NC no es deuda abierta

    // Ventana: emitida dentro de [minDate, cutoff]. Se puede desactivar cuando
    // el universo ya viene acotado aguas arriba (Cliente 360).
    if (!includeAllIssueDates) {
      const { issueDate } = normalized;
      if (issueDate === null || issueDate < context.minFinancialDate) continue;
      if (issueDate > context.cutoffDate) continue;
    }

    // Saldo negativo original (antes del clamp) → diagnóstico.
    if (safeNum(inv.balance_amount) < 0) {
      emit({
        code: "negative_open_balance",
        invoiceId: invoiceId || "unknown",
        currency: normalized.currency,
        detail: roundMoney(safeNum(inv.balance_amount)),
      });
    }

    if (!(normalized.pending > OPEN_EPSILON)) continue; // sin saldo abierto

    if (!normalized.companyId) {
      emit({
        code: "invoice_without_company",
        invoiceId: invoiceId || "unknown",
        currency: normalized.currency,
      });
    }

    const openInstallments = invoiceId
      ? openInstallmentsByInvoice.get(invoiceId) ?? []
      : [];

    if (openInstallments.length > 0) {
      // Camino cuotas: una unidad por cuota abierta. Sin unidad de factura.
      const installmentsOpenSum = roundMoney(
        openInstallments.reduce((s, c) => s + c.openBalance, 0)
      );
      if (Math.abs(installmentsOpenSum - normalized.pending) > INSTALLMENT_MISMATCH_TOLERANCE) {
        emit({
          code: "installment_balance_mismatch",
          invoiceId,
          currency: normalized.currency,
          detail: roundMoney(installmentsOpenSum - normalized.pending),
        });
      }

      for (const c of openInstallments) {
        // La moneda de la cuota debe respetar la de la factura; si difiere o
        // falta, se usa la de la factura (fuente autoritativa del comprobante).
        const currency = c.currency ?? normalized.currency;
        let dueDate = c.dueDate;
        if (dueDate === null) {
          const code: CanonicalDebtDiagnosticCode =
            c.dueDateRaw && c.dueDateRaw.trim() !== "" ? "invalid_due_date" : "missing_due_date";
          emit({ code, invoiceId, installmentId: c.installmentId, currency });
          dueDate = null;
        }
        units.push({
          sourceType: "installment",
          invoiceId,
          installmentId: c.installmentId,
          companyId: normalized.companyId,
          currency,
          dueDate,
          openBalance: c.openBalance,
        });
      }
      continue;
    }

    // Camino factura: una unidad con el vencimiento de la factura.
    let dueDate = normalized.dueDate;
    if (dueDate === null) {
      const raw = inv.due_date != null ? String(inv.due_date).trim() : "";
      const code: CanonicalDebtDiagnosticCode =
        raw !== "" ? "invalid_due_date" : "missing_due_date";
      emit({ code, invoiceId: invoiceId || "unknown", currency: normalized.currency });
      dueDate = null;
    }
    units.push({
      sourceType: "invoice",
      invoiceId: invoiceId || "unknown",
      companyId: normalized.companyId,
      currency: normalized.currency,
      dueDate,
      openBalance: normalized.pending,
    });
  }

  return { units, diagnostics, diagnosticCounts };
}

/** `true` si la unidad está atrasada al corte (vencimiento resoluble y < corte). */
export function isDebtUnitOverdue(
  unit: CanonicalDebtUnit,
  cutoffDate: string
): boolean {
  if (unit.dueDate === null) return false;
  const daysLate = getDaysLate(unit.dueDate, cutoffDate);
  return Number.isFinite(daysLate) && daysLate > 0;
}

/** Filtra unidades cuya factura fue emitida dentro del período (para reuso). */
export function debtUnitsWithinPeriod(
  units: readonly CanonicalDebtUnit[],
  from: string,
  to: string,
  issueDateByInvoice: Map<string, string | null>
): CanonicalDebtUnit[] {
  return units.filter((u) => withinPeriod(issueDateByInvoice.get(u.invoiceId) ?? null, from, to));
}
