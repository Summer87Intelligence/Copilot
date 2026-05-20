/**
 * ZETA-08 Fase 2 — Comparativa aging legacy vs aging por cuota.
 *
 * Motor puro, sin I/O. Recibe el resultado de `computeInstallmentAging`
 * y el `agingByCurrency` del motor legacy, y produce:
 *   - `installment_aging_by_currency`: aging real por cuota, por moneda.
 *   - `installment_vs_legacy_delta`: diferencias, overdue oculto, recomendación.
 *
 * NO modifica ningún campo visible en UI. Solo alimenta `diagnostics`.
 */

import type {
  AgingBucket,
  ReconciliationCurrencyCode,
} from "@/lib/copilot-financial-reconciliation";
import type {
  InstallmentAgingResult,
} from "@/lib/copilot-installment-aging";

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

export type AgingMode = "legacy" | "installment_shadow" | "installment";

export const AGING_MODE_DEFAULT: AgingMode = "legacy";

export function resolveAgingMode(
  envValue: string | undefined,
  queryParam: string | null | undefined
): AgingMode {
  const raw = (queryParam ?? envValue ?? "").toLowerCase().trim();
  if (raw === "installment_shadow") return "installment_shadow";
  if (raw === "installment") return "installment";
  return AGING_MODE_DEFAULT;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InstallmentAgingBucketRange =
  | "current"
  | "overdue_0_30"
  | "overdue_31_60"
  | "overdue_61_90"
  | "overdue_90_plus";

/** Bucket de aging por cuota para una moneda. */
export type InstallmentAgingBucket = {
  range: InstallmentAgingBucketRange;
  amount: number;
  /** Fracción del pendingTotal [0..1]. */
  percentage: number;
};

/** Aging por cuota normalizado por moneda. Estructura paralela a `agingByCurrency`. */
export type InstallmentAgingByCurrency = Partial<
  Record<ReconciliationCurrencyCode, InstallmentAgingBucket[]>
>;

/** Delta por moneda entre motor legacy y motor cuotas. */
export type CurrencyAgingDelta = {
  currency: ReconciliationCurrencyCode;
  /**
   * Overdue en motor legacy: suma de buckets 31_60 + 61_90 + 90_plus.
   * Estos representan facturas abiertas hace más de 30 días desde emisión.
   */
  legacy_overdue_total: number;
  /**
   * Overdue en motor cuotas: suma de overdue_0_30 + 31_60 + 61_90 + 90_plus.
   * Basado en `cuota_vencimiento` real — independiente de cuándo se emitió la factura.
   */
  installment_overdue_total: number;
  /** installment_overdue_total − legacy_overdue_total. Positivo = cuotas detectan más riesgo. */
  diff: number;
  /** diff / legacy_overdue_total. null si legacy_overdue_total = 0. */
  pct_diff: number | null;
  /** true si installment detecta significativamente más overdue que legacy. */
  underestimated: boolean;
  /** Overdue adicional que legacy no captura (max(0, diff)). */
  hidden_overdue: number;
  /**
   * true si hay facturas con cuotas actuales Y vencidas simultáneamente.
   * Estos casos son indetectables para legacy (usa un solo due_date por factura).
   */
  has_partial_overdue: boolean;
};

export type InstallmentVsLegacyDelta = {
  /** Delta por moneda. */
  byCurrency: CurrencyAgingDelta[];
  /** Suma total de overdue oculto cross-currency. */
  total_hidden_overdue: number;
  /** true si al menos una moneda tiene underestimated=true. */
  any_underestimated: boolean;
  /** Facturas con aging mixto (cuotas current + overdue en la misma factura). */
  mixed_aging_invoice_count: number;
  /** Facturas con al menos una cuota vencida. */
  overdue_invoice_count: number;
  /**
   * Recomendación de switch:
   *   - `no_data`      → sin cuotas linkeadas; no hay base para comparar.
   *   - `switch_ready` → datos disponibles, delta manejable (< 5% del pending total).
   *   - `monitor`      → divergencia significativa; investigar antes de activar.
   */
  recommendation: "switch_ready" | "monitor" | "no_data";
};

export type AgingComparativeDiagnostics = {
  mode: AgingMode;
  installment_aging_by_currency: InstallmentAgingByCurrency;
  installment_vs_legacy_delta: InstallmentVsLegacyDelta;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const CURRENCIES: ReadonlyArray<ReconciliationCurrencyCode> = ["USD", "UYU"];
const INSTALLMENT_RANGES: InstallmentAgingBucketRange[] = [
  "current",
  "overdue_0_30",
  "overdue_31_60",
  "overdue_61_90",
  "overdue_90_plus",
];
const LEGACY_OVERDUE_RANGES: Array<"31_60" | "61_90" | "90_plus"> = [
  "31_60",
  "61_90",
  "90_plus",
];
const SALDO_EPSILON = 0.005;

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Genera los diagnósticos comparativos entre aging legacy y aging por cuota.
 *
 * @param installmentResult  Resultado de `computeInstallmentAging`.
 * @param legacyAgingByCurrency  `report.agingByCurrency` del motor legacy.
 * @param mode   Feature flag activo.
 */
export function buildAgingComparativeDiagnostics(
  installmentResult: InstallmentAgingResult,
  legacyAgingByCurrency: Partial<Record<ReconciliationCurrencyCode, AgingBucket[]>>,
  mode: AgingMode
): AgingComparativeDiagnostics {
  // 1. installment_aging_by_currency ----------------------------------------

  const installmentAgingByCurrency: InstallmentAgingByCurrency = {};

  for (const cc of CURRENCIES) {
    const b = installmentResult.byCurrency[cc];
    if (!b) continue;
    const total = b.pendingTotal;
    installmentAgingByCurrency[cc] = INSTALLMENT_RANGES.map((range) => ({
      range,
      amount: b[range],
      percentage: total > SALDO_EPSILON ? round2(b[range] / total) : 0,
    }));
  }

  // 2. Delta per currency ---------------------------------------------------

  let totalLegacyPending = 0;
  const currencyDeltas: CurrencyAgingDelta[] = [];

  for (const cc of CURRENCIES) {
    const instBuckets = installmentResult.byCurrency[cc];
    const legacyBuckets = legacyAgingByCurrency[cc];

    if (!instBuckets && !legacyBuckets) continue;

    // Legacy overdue: buckets 31_60 + 61_90 + 90_plus
    let legacyOverdue = 0;
    let legacyTotal = 0;
    if (legacyBuckets) {
      for (const b of legacyBuckets) {
        legacyTotal = round2(legacyTotal + b.amount);
        if (LEGACY_OVERDUE_RANGES.includes(b.range as typeof LEGACY_OVERDUE_RANGES[number])) {
          legacyOverdue = round2(legacyOverdue + b.amount);
        }
      }
    }
    totalLegacyPending = round2(totalLegacyPending + legacyTotal);

    const installmentOverdue = instBuckets?.overdueTotal ?? 0;
    const diff = round2(installmentOverdue - legacyOverdue);
    const pctDiff =
      legacyOverdue > SALDO_EPSILON ? round2(diff / legacyOverdue) : null;

    const hasPartialOverdue =
      !!instBuckets &&
      instBuckets.current > SALDO_EPSILON &&
      instBuckets.overdueTotal > SALDO_EPSILON;

    currencyDeltas.push({
      currency: cc,
      legacy_overdue_total: legacyOverdue,
      installment_overdue_total: installmentOverdue,
      diff,
      pct_diff: pctDiff,
      underestimated: diff > SALDO_EPSILON,
      hidden_overdue: round2(Math.max(0, diff)),
      has_partial_overdue: hasPartialOverdue,
    });
  }

  // 3. Aggregate -----------------------------------------------------------

  const totalHiddenOverdue = round2(
    currencyDeltas.reduce((s, d) => s + d.hidden_overdue, 0)
  );
  const anyUnderestimated = currencyDeltas.some((d) => d.underestimated);

  const hasAnyInstData = CURRENCIES.some(
    (cc) => (installmentResult.byCurrency[cc]?.pendingTotal ?? 0) > SALDO_EPSILON
  );

  // 4. Recommendation ------------------------------------------------------

  let recommendation: InstallmentVsLegacyDelta["recommendation"] = "no_data";
  if (hasAnyInstData) {
    const hiddenPct =
      totalLegacyPending > SALDO_EPSILON
        ? totalHiddenOverdue / totalLegacyPending
        : 0;
    recommendation = hiddenPct > 0.05 ? "monitor" : "switch_ready";
  }

  return {
    mode,
    installment_aging_by_currency: installmentAgingByCurrency,
    installment_vs_legacy_delta: {
      byCurrency: currencyDeltas,
      total_hidden_overdue: totalHiddenOverdue,
      any_underestimated: anyUnderestimated,
      mixed_aging_invoice_count: installmentResult.mixedAgingInvoiceCount,
      overdue_invoice_count: installmentResult.overdueInvoices.length,
      recommendation,
    },
  };
}
