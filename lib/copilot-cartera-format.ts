/**
 * Helpers puros para la sección Cartera (frontend render-only).
 *
 * Reglas:
 *  - No agregan ni mutan datos financieros.
 *  - No leen del DOM ni de React. Son funciones puras testeables.
 *  - Mantienen el formato es-UY del resto del producto:
 *      UYU → "$ 1.234"
 *      USD → "U$S 1.234,56"
 */

import type {
  ReconciliationCurrencyCode,
  StalenessStatus,
  SyncStateSummary,
} from "@/lib/copilot-financial-reconciliation";

const CURRENCY_SYMBOL: Record<ReconciliationCurrencyCode, string> = {
  UYU: "$",
  USD: "U$S",
};

const CURRENCY_LABEL: Record<ReconciliationCurrencyCode, string> = {
  UYU: "Pesos uruguayos",
  USD: "Dólares",
};

const CURRENCY_SHORT_LABEL: Record<ReconciliationCurrencyCode, string> = {
  UYU: "Pesos",
  USD: "Dólares",
};

/** Rango de fechas para cards de Cartera: Período: DD/MM/YYYY — DD/MM/YYYY */
export function formatCarteraPeriodRange(fromYmd: string, toYmd: string): string {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.slice(0, 10).split("-");
    if (!y || !m || !d) return ymd;
    return `${d}/${m}/${y}`;
  };
  return `Período: ${fmt(fromYmd)} — ${fmt(toYmd)}`;
}

export function currencySymbolFor(code: ReconciliationCurrencyCode | string): string {
  if (code === "UYU" || code === "USD") return CURRENCY_SYMBOL[code];
  return code;
}

export function currencyLabelFor(code: ReconciliationCurrencyCode | string): string {
  if (code === "UYU" || code === "USD") return CURRENCY_LABEL[code];
  return code;
}

export function currencyShortLabelFor(
  code: ReconciliationCurrencyCode | string
): string {
  if (code === "UYU" || code === "USD") return CURRENCY_SHORT_LABEL[code];
  return code;
}

/**
 * Formatea montos financieros con la convención del producto:
 *  - 2 decimales por defecto (es-UY: separador miles ".", decimal ",")
 *  - símbolo separado por espacio: "U$S 15.366,65"
 */
export function formatCarteraMoney(
  code: ReconciliationCurrencyCode | string,
  amount: number,
  opts: { fractionDigits?: number } = {}
): string {
  const digits = opts.fractionDigits ?? 2;
  const safe = Number.isFinite(amount) ? amount : 0;
  const num = safe.toLocaleString("es-UY", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${currencySymbolFor(code)} ${num}`;
}

export function formatCarteraInteger(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("es-UY");
}

/**
 * Formatea un ratio en [0..1] como porcentaje con 1 decimal.
 *  - 0.8146 → "81,5%"
 *  - null   → "—"
 */
export function formatCarteraPercent(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return `${pct.toLocaleString("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/**
 * Convierte un número de horas en etiqueta relativa breve:
 *   < 1h         → "hace minutos"
 *   < 24h        → "hace 3h"
 *   < 30 días    → "hace 2 d"
 *   resto        → "hace 45 d"
 */
export function formatRelativeAgeHours(ageHours: number | null | undefined): string {
  if (ageHours == null || !Number.isFinite(ageHours)) return "sin registro";
  if (ageHours < 1) return "hace minutos";
  if (ageHours < 24) return `hace ${Math.round(ageHours)}h`;
  const days = Math.round(ageHours / 24);
  return `hace ${days} d`;
}

/**
 * Selecciona la sync state más reciente (mayor `last_success_at`) entre los
 * `syncStates` provistos. Retorna `null` si ninguno tiene timestamp válido.
 */
export function pickMostRecentSync(
  syncStates: readonly SyncStateSummary[]
): SyncStateSummary | null {
  let best: SyncStateSummary | null = null;
  let bestMs = -Infinity;
  for (const s of syncStates) {
    if (!s.last_success_at) continue;
    const ms = Date.parse(s.last_success_at);
    if (!Number.isFinite(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = s;
    }
  }
  return best;
}

const STATUS_RANK: Record<StalenessStatus, number> = {
  never_synced: 0,
  critical: 1,
  warning: 2,
  ok: 3,
};

/** Devuelve el peor status entre los syncStates (peor = menor rank). */
export function pickWorstSyncStatus(
  syncStates: readonly SyncStateSummary[]
): StalenessStatus {
  if (syncStates.length === 0) return "never_synced";
  let worst: StalenessStatus = "ok";
  for (const s of syncStates) {
    if (STATUS_RANK[s.status] < STATUS_RANK[worst]) worst = s.status;
  }
  return worst;
}

/**
 * Calcula efectividad de cobranza por moneda a partir de totales ya agregados
 * por el backend. NO suma facturas individuales: solo divide dos sumas que
 * ya vinieron del reporte.
 *
 *   effectiveness = (totalInvoiced - totalPending) / totalInvoiced
 *
 * Devuelve `null` si `totalInvoiced <= 0` (evita división por cero).
 */
export function deriveCollectionEffectiveness(args: {
  totalInvoiced: number;
  totalPending: number;
}): number | null {
  if (!Number.isFinite(args.totalInvoiced) || args.totalInvoiced <= 0) return null;
  const collected = args.totalInvoiced - Math.max(0, args.totalPending);
  return Math.max(0, Math.min(1, collected / args.totalInvoiced));
}
