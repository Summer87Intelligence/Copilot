/**
 * Fase 3 multi-moneda — evaluación de thresholds de riesgo por moneda.
 * UYU y USD tienen escalas distintas; nunca sumar antes de comparar contra threshold.
 */

export type SnapshotCurrencyCode = "UYU" | "USD";
export type CurrencyRiskLevel = "low" | "medium" | "high" | "critical";

export type CurrencyRiskResult = {
  currency: SnapshotCurrencyCode;
  overdueRisk: CurrencyRiskLevel;
  debtRisk: CurrencyRiskLevel;
  overallRisk: CurrencyRiskLevel;
};

export type CurrencyRiskSummary = {
  mixedCurrency: boolean;
  highestRiskCurrency: SnapshotCurrencyCode | null;
  highestRisk: CurrencyRiskLevel;
  byCurrency: Partial<Record<SnapshotCurrencyCode, CurrencyRiskResult>>;
};

export type CurrencyThresholds = {
  overdue: { high: number; critical: number };
  debt: { high: number; critical: number };
};

// UYU: calibrados para escala UYU (comparable con thresholds legacy).
// USD: calibrados para escala USD (~1/40 de UYU dado el tipo de cambio operativo).
export const THRESHOLDS_BY_CURRENCY: Record<SnapshotCurrencyCode, CurrencyThresholds> = {
  UYU: {
    overdue: { high: 50_000, critical: 280_000 },
    debt: { high: 60_000, critical: 120_000 },
  },
  USD: {
    overdue: { high: 1_500, critical: 7_000 },
    debt: { high: 1_500, critical: 3_000 },
  },
};

const RISK_ORDER: CurrencyRiskLevel[] = ["low", "medium", "high", "critical"];

export function maxCurrencyRiskLevel(
  a: CurrencyRiskLevel,
  b: CurrencyRiskLevel
): CurrencyRiskLevel {
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
}

function riskLevelFromAmount(
  amount: number,
  thresholds: { high: number; critical: number }
): CurrencyRiskLevel {
  if (amount >= thresholds.critical) return "critical";
  if (amount >= thresholds.high) return "high";
  if (amount > 0) return "medium";
  return "low";
}

export function evaluateCurrencyThresholds(
  byCurrency: Partial<Record<SnapshotCurrencyCode, { pending?: number; overdue?: number }>>,
  thresholds?: Partial<Record<SnapshotCurrencyCode, CurrencyThresholds>>
): Partial<Record<SnapshotCurrencyCode, CurrencyRiskResult>> {
  const t = thresholds ?? THRESHOLDS_BY_CURRENCY;
  const result: Partial<Record<SnapshotCurrencyCode, CurrencyRiskResult>> = {};

  for (const [cur, totals] of Object.entries(byCurrency) as [
    SnapshotCurrencyCode,
    { pending?: number; overdue?: number },
  ][]) {
    const currencyThresholds = t[cur] ?? THRESHOLDS_BY_CURRENCY[cur];
    if (!totals || !currencyThresholds) continue;
    const overdueAmt = totals.overdue ?? 0;
    const debtAmt = totals.pending ?? 0;
    const overdueRisk = riskLevelFromAmount(overdueAmt, currencyThresholds.overdue);
    const debtRisk = riskLevelFromAmount(debtAmt, currencyThresholds.debt);
    result[cur] = {
      currency: cur,
      overdueRisk,
      debtRisk,
      overallRisk: maxCurrencyRiskLevel(overdueRisk, debtRisk),
    };
  }
  return result;
}

export function buildCurrencyRiskSummary(
  byCurrency:
    | Partial<Record<SnapshotCurrencyCode, { pending?: number; overdue?: number }>>
    | undefined
): CurrencyRiskSummary {
  if (!byCurrency || Object.keys(byCurrency).length === 0) {
    return { mixedCurrency: false, highestRiskCurrency: null, highestRisk: "low", byCurrency: {} };
  }

  const evaluated = evaluateCurrencyThresholds(byCurrency);
  const keys = Object.keys(evaluated) as SnapshotCurrencyCode[];
  let highestRisk: CurrencyRiskLevel = "low";
  let highestRiskCurrency: SnapshotCurrencyCode | null = null;

  for (const [cur, res] of Object.entries(evaluated) as [
    SnapshotCurrencyCode,
    CurrencyRiskResult,
  ][]) {
    if (!res) continue;
    if (RISK_ORDER.indexOf(res.overallRisk) > RISK_ORDER.indexOf(highestRisk)) {
      highestRisk = res.overallRisk;
      highestRiskCurrency = cur;
    }
  }

  return { mixedCurrency: keys.length > 1, highestRiskCurrency, highestRisk, byCurrency: evaluated };
}

export function currencyRiskToClientRiskLabel(
  level: CurrencyRiskLevel
): "Alto" | "Medio" | "Bajo" {
  if (level === "critical" || level === "high") return "Alto";
  if (level === "medium") return "Medio";
  return "Bajo";
}

export function currencyRiskLevelLabel(level: CurrencyRiskLevel): string {
  const map: Record<CurrencyRiskLevel, string> = {
    low: "bajo",
    medium: "medio",
    high: "alto",
    critical: "crítico",
  };
  return map[level];
}
