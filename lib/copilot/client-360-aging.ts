/**
 * CLIENT-360 AGING — buckets operativos de atraso por moneda para la ficha 360.
 *
 * FASE 1: deriva de la capa canónica (`buildCanonicalDebtUnits` +
 * `buildCanonicalAgingMetricsFromUnits`). El aging de Cliente 360, Cartera y Hoy
 * comparte ahora exactamente la misma clasificación por `due_date`.
 *
 * Universo: se mantiene el del cliente (dedupe shadow↔CCV1 + saldo autoritativo),
 * sin aplicar la ventana `issue_date` (`includeAllIssueDates`), para preservar
 * paridad con el comportamiento previo. Cuando existen cuotas abiertas
 * (`proto_invoice_installments`), el aging se calcula por cuota; si no, por
 * factura. Sin due_date ⇒ `on_time` (consistente con "no atrasado").
 *
 * Función pura: sin React, sin I/O. Ver docs/product/copilot-operating-language.md
 */

import { readInvoiceFinancial } from "@/lib/copilot-invoice-financial-read";
import {
  readOperationalDebtInvoiceCurrency,
  selectOperationalDebtInvoicesForSummation,
  type OperationalDebtInvoiceInput,
} from "@/lib/zeta/zeta-operational-debt-dedup";
import { OPERATING_DELAY_BUCKET_ORDER, type OperatingDelayBucket } from "@/lib/copilot/operating-aging";
import { buildCanonicalFinancialContext } from "@/lib/financial/canonical/report-context";
import {
  buildCanonicalDebtUnits,
  isDebtUnitOverdue,
} from "@/lib/financial/canonical/debt-units";
import { buildCanonicalAgingMetricsFromUnits } from "@/lib/financial/canonical/metrics-from-units";
import type {
  CanonicalInstallmentInput,
  CanonicalInvoiceInput,
} from "@/lib/financial/canonical/types";

const PENDING_EPSILON = 0.005;

export type Client360AgingBuckets = Record<OperatingDelayBucket, number>;

export type Client360Aging = {
  UYU: Client360AgingBuckets;
  USD: Client360AgingBuckets;
  /** Unidades vencibles abiertas con atraso (due_date < hoy), por moneda. */
  lateInvoiceCount: { UYU: number; USD: number };
};

function emptyBuckets(): Client360AgingBuckets {
  return {
    on_time: 0,
    late_1_7: 0,
    late_8_14: 0,
    late_15_30: 0,
    late_30_plus: 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function ymd(iso: unknown): string {
  const s = String(iso ?? "").trim();
  return s.length >= 10 ? s.slice(0, 10) : "";
}

/**
 * Construye los buckets de atraso por moneda para la ficha 360.
 * `todayYmd` inyectable para tests/SSR; sin él, cada call site debe pasar hoy MVD.
 * `installments`: cuotas abiertas del cliente (opcional). Cuando se pasan, el
 * aging se calcula por cuota real.
 */
export function buildClient360Aging<T extends OperationalDebtInvoiceInput>(
  invoices: readonly T[],
  options: {
    todayYmd: string;
    invoiceBalanceMap?: Map<string, number>;
    installments?: readonly CanonicalInstallmentInput[];
  }
): Client360Aging {
  const selections = selectOperationalDebtInvoicesForSummation(invoices, {
    invoiceBalanceMap: options.invoiceBalanceMap,
  });

  // Mapear cada factura deduplicada a la entrada canónica con saldo autoritativo.
  const canonicalInvoices: CanonicalInvoiceInput[] = [];
  for (const sel of selections) {
    const inv = sel.invoice;
    const fin = readInvoiceFinancial({
      invoiceId: String(inv.id ?? "").trim() || "unknown",
      balancePersisted: inv.balance_amount,
      totalAmount: inv.total_amount,
      balanceFromFinancialsMap: options.invoiceBalanceMap,
    });
    const pending = Math.max(0, fin.balance_authoritative);
    if (!(pending > PENDING_EPSILON)) continue;
    const currency = readOperationalDebtInvoiceCurrency(inv);
    canonicalInvoices.push({
      id: String(inv.id ?? "").trim() || "unknown",
      company_id: (inv as { company_id?: unknown }).company_id != null
        ? String((inv as { company_id?: unknown }).company_id)
        : null,
      currency_code: currency,
      total_amount: Math.max(pending, Number(inv.total_amount) || pending),
      balance_amount: pending,
      status: "issued",
      due_date: ymd(inv.due_date) || null,
    });
  }

  const context = buildCanonicalFinancialContext({
    workspaceId: "client-360",
    periodEnd: options.todayYmd,
    cutoffDate: options.todayYmd,
  });

  const { units } = buildCanonicalDebtUnits({
    invoices: canonicalInvoices,
    installments: options.installments,
    context,
    includeAllIssueDates: true,
  });

  const aging: Client360Aging = {
    UYU: emptyBuckets(),
    USD: emptyBuckets(),
    lateInvoiceCount: { UYU: 0, USD: 0 },
  };

  for (const currency of ["UYU", "USD"] as const) {
    const m = buildCanonicalAgingMetricsFromUnits(units, currency, options.todayYmd);
    aging[currency] = {
      on_time: m.current,
      late_1_7: m.overdue1To7,
      late_8_14: m.overdue8To14,
      late_15_30: m.overdue15To30,
      late_30_plus: m.overdue31Plus,
    };
  }

  for (const u of units) {
    if (u.currency !== "UYU" && u.currency !== "USD") continue;
    if (!(u.openBalance > 0)) continue;
    if (isDebtUnitOverdue(u, options.todayYmd)) aging.lateInvoiceCount[u.currency] += 1;
  }

  return aging;
}

/** Total (suma de todos los buckets) por moneda. */
export function sumAgingBuckets(buckets: Client360AgingBuckets): number {
  return round2(
    OPERATING_DELAY_BUCKET_ORDER.reduce((acc, b) => acc + buckets[b], 0)
  );
}

/** Total atrasado (todos los buckets excepto on_time) por moneda. */
export function sumLateBuckets(buckets: Client360AgingBuckets): number {
  return round2(
    OPERATING_DELAY_BUCKET_ORDER.filter((b) => b !== "on_time").reduce(
      (acc, b) => acc + buckets[b],
      0
    )
  );
}
