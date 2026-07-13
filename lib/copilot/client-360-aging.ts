/**
 * CLIENT-360 AGING — buckets operativos de atraso por moneda para la ficha 360.
 *
 * Reutiliza la MISMA fuente de verdad que la deuda/atraso operativa:
 *   - `selectOperationalDebtInvoicesForSummation` (dedupe shadow ↔ CCV1)
 *   - `readInvoiceFinancial` (saldo autoritativo)
 *   - `due_date` como fecha de atraso (idéntico a `aggregateOperationalDebtForCompany`)
 *   - `operating-aging` para clasificar el bucket
 *
 * Así los buckets NUNCA divergen del total pendiente ni del atrasado que ya
 * muestra la ficha. Sin due_date ⇒ `on_time` (consistente con "no atrasado").
 *
 * Función pura: sin React, sin I/O. Ver docs/product/copilot-operating-language.md
 */

import { readInvoiceFinancial } from "@/lib/copilot-invoice-financial-read";
import {
  readOperationalDebtInvoiceCurrency,
  selectOperationalDebtInvoicesForSummation,
  type OperationalDebtInvoiceInput,
} from "@/lib/zeta/zeta-operational-debt-dedup";
import {
  getDaysLate,
  getOperatingDelayBucket,
  OPERATING_DELAY_BUCKET_ORDER,
  type OperatingDelayBucket,
} from "@/lib/copilot/operating-aging";

const PENDING_EPSILON = 0.005;

export type Client360AgingBuckets = Record<OperatingDelayBucket, number>;

export type Client360Aging = {
  UYU: Client360AgingBuckets;
  USD: Client360AgingBuckets;
  /** Facturas abiertas con atraso (due_date < hoy), por moneda. */
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
 */
export function buildClient360Aging<T extends OperationalDebtInvoiceInput>(
  invoices: readonly T[],
  options: { todayYmd: string; invoiceBalanceMap?: Map<string, number> }
): Client360Aging {
  const aging: Client360Aging = {
    UYU: emptyBuckets(),
    USD: emptyBuckets(),
    lateInvoiceCount: { UYU: 0, USD: 0 },
  };

  const selections = selectOperationalDebtInvoicesForSummation(invoices, {
    invoiceBalanceMap: options.invoiceBalanceMap,
  });

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
    if (currency !== "UYU" && currency !== "USD") continue;

    const due = ymd(inv.due_date);
    const bucket: OperatingDelayBucket = due
      ? getOperatingDelayBucket(getDaysLate(due, options.todayYmd))
      : "on_time";

    aging[currency][bucket] = round2(aging[currency][bucket] + pending);
    if (bucket !== "on_time") aging.lateInvoiceCount[currency] += 1;
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
