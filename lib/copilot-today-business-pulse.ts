/**
 * Pulso del negocio — helper puro, sin LLM, sin APIs, sin Supabase.
 * Lenguaje ejecutivo: sin términos técnicos en el output.
 * Multi-moneda: UYU y USD siempre separados, nunca sumados ni convertidos.
 */

import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import {
  sumCarteraAgingOverdue,
  totalsRoughlyEqual,
  type CarteraCurrencyTotals,
} from "@/lib/copilot-cartera-aging-totals";
import type { AgingBucket, ReconciliationCurrencyCode } from "@/lib/copilot-financial-reconciliation";
import {
  snapshotCashNet,
  snapshotCoverageRatio,
  snapshotExpectedOutflowsTotal,
  snapshotIsTruncated,
  snapshotLiquidityBalance,
  snapshotRiskBand,
} from "@/lib/copilot-financial-snapshot-selectors";
import { buildCurrencyIndex } from "@/lib/copilot-cartera-cards-source";
import { resolveCanonicalActiveDebt } from "@/lib/financial/canonical-debt-metrics";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { HoyPeriodRange } from "@/lib/copilot-hoy-period";
import {
  buildHoyCurrentScope,
  buildHoyCurrentStateBlocks,
  buildHoyPeriodActivity,
  buildHoyPeriodActivityBlocks,
  type HoyCurrentScope,
  type HoyCurrentStateBlock,
  type HoyPeriodActivity,
  type HoyPeriodActivityBlock,
} from "@/lib/copilot-hoy-scopes";
import {
  buildHoyCashPositionBlocks,
  buildHoyProjection30dBlocks,
  buildHoyTreasuryAlerts,
  type HoyCashPositionBlock,
  type HoyProjection30dBlock,
  type HoyTreasuryAlert,
} from "@/lib/copilot-hoy-treasury";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import {
  buildAttentionClientsSummary,
  clientQualifiesForAttention,
  countActiveDebtorClients,
  buildCurrencyExecutiveBlocks,
  buildDebtorCollectionRows,
  buildFinancialSituationBlocks,
  countDebtorsByCurrency,
  debtorRowsToPriorityCollections,
  extractAgingTotals,
  HOY_PRIORITY_TABLE_TOP,
  type AttentionClientsSummary,
  type CarteraPeriodMetrics,
  type CurrencyExecutiveBlock,
  type DebtorCollectionRow,
  type FinancialSituationBlock,
} from "@/lib/copilot-hoy-executive";
import type {
  TreasuryOutflowSummary,
  TreasuryScheduledPayment,
} from "@/lib/treasury/treasury-scheduled-payments";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PulseStatus = "healthy" | "attention" | "critical";
export type PulseTone = "ok" | "warning" | "critical" | "neutral";
export type PulseUrgency = "alta" | "media" | "baja";

/** Monto en una moneda específica. UYU y USD nunca se suman entre sí. */
export type MoneyAmount = {
  currency: "UYU" | "USD";
  amount: number;
  formatted: string; // "UYU $ 68.650" | "USD U$S 6.735"
};

export type KeyIndicator = {
  id: string;
  label: string;
  /** Valor principal cuando no es monetario (conteo, ratio, estado). */
  value: string;
  subValue?: string;
  tone: PulseTone;
  helperText: string;
  deepLink: string;
  detailTitle: string;
  detailBody: string;
  /** Para indicadores monetarios: montos por moneda, nunca mezclados. */
  currencyValues?: MoneyAmount[];
};

export type PriorityCollection = {
  company_id: string;
  name: string;
  /** Legacy: total mixto (solo para ordenamiento). No usar en display. */
  deuda: number;
  /** Legacy: vencido mixto (solo para ordenamiento). No usar en display. */
  vencido: number;
  riesgo: "Bajo" | "Medio" | "Alto";
  accion: string;
  deepLink: string;
  /** Deuda por moneda para display. */
  deuda_breakdown: MoneyAmount[];
  /** Vencido por moneda para display. */
  vencido_breakdown: MoneyAmount[];
};

export type PendingItem = {
  id: string;
  title: string;
  impacto: string;
  accion: string;
  deepLink: string;
  urgency: PulseUrgency;
};

export type SummaryItem = {
  label: string;
  value: string;
  trend: "up" | "down" | "neutral";
  description: string;
};

export type RecommendedAction = {
  id: string;
  label: string;
  deepLink: string;
  tone: PulseTone;
};

export type HoyClientCounts = {
  /** Clientes en portfolio (cartera activa). */
  activeClients: number;
  /** Clientes con saldo UYU > 0 o USD > 0 (Explorador de deuda). */
  debtorClients: number;
  /** Subgrupo: vencido, cobro lento o datos pendientes. */
  attentionClients: number;
  /** Filas en tabla/drawer (una por moneda). */
  debtorRows: number;
};

export type TodayBusinessPulse = {
  overallStatus: PulseStatus;
  headline: string;
  /** Subcopy del hero: atención vs activos. */
  heroSubline: string | null;
  clientCounts: HoyClientCounts;
  summaryBullets: string[];
  /** Bloques UYU / USD — resumen principal del CEO. */
  currencyBlocks: CurrencyExecutiveBlock[];
  /** Indicadores operativos (atención + datos). */
  operationalIndicators: KeyIndicator[];
  /** @deprecated Usar operationalIndicators + currencyBlocks en UI. */
  keyIndicators: KeyIndicator[];
  /** Top N en tabla; lista completa en allDebtorRows. */
  priorityCollections: PriorityCollection[];
  allDebtorRows: DebtorCollectionRow[];
  attentionClients: AttentionClientsSummary;
  financialSituation: FinancialSituationBlock[];
  importantPendingItems: PendingItem[];
  /** @deprecated Usar financialSituation. */
  last30DaysSummary: SummaryItem[];
  recommendedActions: RecommendedAction[];
  dataWarning: string | null;
  /** Alertas ejecutivas cruce deuda ↔ egresos (sin LLM). */
  treasuryAlerts: HoyTreasuryAlert[];
  treasuryOutflowsConfigured: boolean;
  /** Caja actual por moneda (sin deuda pendiente). */
  cashPositionBlocks: HoyCashPositionBlock[];
  /** Proyección 30d: caja segura vs esperada, por moneda. */
  projection30dBlocks: HoyProjection30dBlock[];
  /** Período confirmado (solo afecta actividad del período). */
  periodRange: HoyPeriodRange;
  currentScope: HoyCurrentScope;
  currentStateBlocks: HoyCurrentStateBlock[];
  periodActivity: HoyPeriodActivity;
  periodActivityBlocks: HoyPeriodActivityBlock[];
};

export type {
  CurrencyExecutiveBlock,
  DebtorCollectionRow,
  AttentionClientsSummary,
  FinancialSituationBlock,
  CarteraPeriodMetrics,
} from "@/lib/copilot-hoy-executive";

export type {
  HoyCashPositionBlock,
  HoyProjection30dBlock,
  HoyTreasuryAlert,
} from "@/lib/copilot-hoy-treasury";
export type {
  HoyCurrentScope,
  HoyCurrentStateBlock,
  HoyPeriodActivity,
  HoyPeriodActivityBlock,
} from "@/lib/copilot-hoy-scopes";
export type { HoyPeriodRange } from "@/lib/copilot-hoy-period";
export { defaultHoyPeriodRange, formatHoyPeriodLabel } from "@/lib/copilot-hoy-period";

export {
  countActiveDebtorClients,
  clientQualifiesForAttention,
} from "@/lib/copilot-hoy-executive";

export { HOY_PRIORITY_TABLE_TOP } from "@/lib/copilot-hoy-executive";

export type BusinessPulseGate = {
  confidence: "high" | "medium" | "low";
  coverage: "full" | "partial" | "insufficient";
  recommendations_enabled: boolean;
};

/**
 * Fuente del indicador de mora en Hoy (mapping con Cartera):
 * - `cartera_aging` → `report.agingByCurrency` buckets 31–60 + 61–90 + +90 (Aging).
 * - `portfolio_due` → Σ overdue_uyu / overdue_usd por factura con vencimiento anterior a hoy.
 * - `opening_carry` → el monto coincide con saldo anterior (card Anterior), no con Aging.
 */
export type OverdueDisplayMode = "cartera_aging" | "portfolio_due" | "opening_carry";

export type OverdueDisplaySemantics = {
  mode: OverdueDisplayMode;
  breakdown: MoneyAmount[];
  clientCount: number;
  /** Copy ejecutivo: "deuda vencida" | "deuda arrastrada". */
  debtLabel: string;
};

export type BusinessPulseInput = {
  snapshot: FinancialSnapshotApiV1 | null;
  portfolioRows: ClientPortfolioRow[] | null;
  gate: BusinessPulseGate;
  /**
   * Totales de Aging de Cartera (mismo motor que `/copilot/cartera`).
   * Si se provee, el indicador "Atrasado" usa esta fuente (Opción B).
   */
  carteraAgingOverdue?: CarteraCurrencyTotals;
  /**
   * Saldo anterior por moneda (`CurrencyReconciliation.openingBalance`).
   * Solo para detectar mislabel vs card Anterior en Cartera.
   */
  carteraOpeningByCurrency?: CarteraCurrencyTotals;
  /**
   * @deprecated Preferir `periodReportCurrencies` + `periodRange`.
   * Métricas legacy (cobrado aplicado). Tests de Cartera.
   */
  carteraPeriodMetrics?: CarteraPeriodMetrics;
  /** Rango confirmado — solo actividad del período. */
  periodRange?: HoyPeriodRange;
  /** `report.currencies` de reconciliación `mode=period_only`. */
  periodReportCurrencies?: unknown;
  /**
   * `report.currencies` de reconciliación `mode=all_outstanding`.
   * Fuente canónica de deuda activa total (pendingAtCutoff) — mismo rollup que Cartera/Dashboard.
   */
  outstandingReportCurrencies?: unknown;
  /** Movimientos manuales para ingresos/egresos del período. */
  manualCashMovements?: readonly ManualCashMovement[];
  /**
   * Cobros registrados acumulados por clientes (suma de recibos) para caja actual en Hoy.
   * Con `mode=all_outstanding` en reconciliación = acumulado histórico, independiente del rango de reportes.
   */
  carteraCollectedToDate?: CarteraCurrencyTotals;
  /** Bucket 0–30 por moneda (Cartera Aging). */
  carteraAgingCurrent?: CarteraCurrencyTotals;
  /** Resumen de pagos programados (Tesorería / planned_cash_obligations). */
  treasuryOutflowSummaries?: TreasuryOutflowSummary[];
  /** Posición de caja actual por moneda (movimientos manuales + saldo inicial). */
  treasuryCashPositions?: readonly CashPositionByCurrency[];
  /** Ítems de pagos programados (para proyección fin de mes). */
  treasuryScheduledPayments?: readonly TreasuryScheduledPayment[];
  /** Injectable para tests — YYYY-MM-DD. */
  today?: string;
};

/**
 * Métricas por moneda desde `report.currencies` — mismo normalizador que Cartera/Dashboard.
 *
 * `collected` = **Cobrado aplicado** (`portfolioResolvedAmount`): parte de las ventas
 * del período ya saldada al corte. No usar `collectedInPeriod` (recibos brutos por fecha).
 */
export function carteraPeriodMetricsFromReport(currencies: unknown): CarteraPeriodMetrics {
  const billed: CarteraCurrencyTotals = { UYU: 0, USD: 0 };
  const collected: CarteraCurrencyTotals = { UYU: 0, USD: 0 };
  const pending: CarteraCurrencyTotals = { UYU: 0, USD: 0 };

  const index = buildCurrencyIndex(currencies);
  for (const code of ["UYU", "USD"] as const) {
    const m = index.get(code);
    if (!m) continue;
    billed[code] = Math.round(m.issuedInPeriodNet * 100) / 100;
    collected[code] = Math.round(m.portfolioResolvedAmount * 100) / 100;
    pending[code] = Math.round(m.pendingAtCutoff * 100) / 100;
  }

  return { billed, collected, pending };
}

/**
 * Cobros registrados acumulados hasta hoy — suma de recibos (`collectedInPeriod` del motor).
 * En `mode=all_outstanding` no hay filtro de período: todos los recibos sincronizados.
 * No usar `portfolioResolvedAmount` (residual del período / corte de deuda).
 */
export function carteraCollectedToDateFromReport(currencies: unknown): CarteraCurrencyTotals {
  const collected: CarteraCurrencyTotals = { UYU: 0, USD: 0 };
  const index = buildCurrencyIndex(currencies);
  for (const code of ["UYU", "USD"] as const) {
    const m = index.get(code);
    if (!m) continue;
    collected[code] = Math.round(m.collectedInPeriod * 100) / 100;
  }
  return collected;
}

/** Extrae overdue de Aging desde el reporte de reconciliación (helper para la página Hoy). */
export function carteraAgingOverdueFromReport(
  agingByCurrency: Partial<Record<ReconciliationCurrencyCode, AgingBucket[]>>
): CarteraCurrencyTotals {
  return sumCarteraAgingOverdue(agingByCurrency);
}

/** Extrae saldo anterior por moneda desde `report.currencies`. */
export function carteraOpeningFromReport(
  currencies: Array<{ currencyCode?: string; openingBalance?: number }>
): CarteraCurrencyTotals {
  const out: CarteraCurrencyTotals = { UYU: 0, USD: 0 };
  for (const c of currencies) {
    const code = (c.currencyCode ?? "").trim().toUpperCase();
    const amt = typeof c.openingBalance === "number" && Number.isFinite(c.openingBalance)
      ? c.openingBalance
      : 0;
    if (code === "UYU") out.UYU = Math.round(amt * 100) / 100;
    if (code === "USD") out.USD = Math.round(amt * 100) / 100;
  }
  return out;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function fmtCurrencyAmount(amount: number, currency: "UYU" | "USD"): string {
  const n = amount.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  return currency === "USD" ? `U$S ${n}` : `$ ${n}`;
}

export function makeMoneyAmount(amount: number, currency: "UYU" | "USD"): MoneyAmount {
  return { currency, amount, formatted: fmtCurrencyAmount(amount, currency) };
}

/** Construye breakdown por moneda. Solo incluye monedas con monto > 0. */
export function buildBreakdown(uyu: number, usd: number): MoneyAmount[] {
  const out: MoneyAmount[] = [];
  if (uyu > 0) out.push(makeMoneyAmount(uyu, "UYU"));
  if (usd > 0) out.push(makeMoneyAmount(usd, "USD"));
  return out;
}

function totalsFromBreakdown(breakdown: MoneyAmount[]): CarteraCurrencyTotals {
  let uyu = 0;
  let usd = 0;
  for (const m of breakdown) {
    if (m.currency === "UYU") uyu = m.amount;
    if (m.currency === "USD") usd = m.amount;
  }
  return { UYU: uyu, USD: usd };
}

function portfolioOverdueBreakdown(rows: ClientPortfolioRow[]): MoneyAmount[] {
  const hasPerCurrencyOverdue = rows.some(
    (r) => r.overdue_uyu !== undefined || r.overdue_usd !== undefined
  );
  const totalOverdueUYU = hasPerCurrencyOverdue
    ? rows.reduce((s, r) => s + (r.overdue_uyu ?? 0), 0)
    : 0;
  const totalOverdueUSD = hasPerCurrencyOverdue
    ? rows.reduce((s, r) => s + (r.overdue_usd ?? 0), 0)
    : 0;
  const legacyOverdue = rows.reduce((s, r) => s + r.overdue_debt, 0);
  const totalDebtUYU = rows.reduce((s, r) => s + (r.debt_uyu ?? 0), 0);
  const totalDebtUSD = rows.reduce((s, r) => s + (r.debt_usd ?? 0), 0);

  if (hasPerCurrencyOverdue) {
    return buildBreakdown(totalOverdueUYU, totalOverdueUSD);
  }
  if (legacyOverdue > 0) {
    return buildBreakdown(
      totalDebtUSD === 0 ? legacyOverdue : 0,
      totalDebtUYU === 0 ? legacyOverdue : 0
    );
  }
  return [];
}

/**
 * Resuelve qué mostrar en el indicador de mora y con qué etiqueta.
 * Prioridad: Aging Cartera → portfolio; si el monto = saldo anterior → arrastrada.
 */
export function resolveOverdueDisplaySemantics(
  input: BusinessPulseInput
): OverdueDisplaySemantics {
  const rows = input.portfolioRows ?? [];
  const clientCount = rows.filter((r) => r.overdue_debt > 0).length;

  if (input.carteraAgingOverdue) {
    return {
      mode: "cartera_aging",
      breakdown: buildBreakdown(
        input.carteraAgingOverdue.UYU,
        input.carteraAgingOverdue.USD
      ),
      clientCount,
      debtLabel: "deuda atrasada",
    };
  }

  const portfolioBreakdown = portfolioOverdueBreakdown(rows);
  const opening = input.carteraOpeningByCurrency;

  if (
    opening &&
    portfolioBreakdown.length > 0 &&
    totalsRoughlyEqual(totalsFromBreakdown(portfolioBreakdown), opening, 1)
  ) {
    return {
      mode: "opening_carry",
      breakdown: portfolioBreakdown,
      clientCount: rows.filter((r) => r.total_debt > 0).length,
      debtLabel: "deuda arrastrada",
    };
  }

  return {
    mode: "portfolio_due",
    breakdown: portfolioBreakdown,
    clientCount,
    debtLabel: "deuda vencida",
  };
}

function overdueCopy(mode: OverdueDisplayMode): {
  label: string;
  helperText: string;
  detailTitle: string;
  detailBodyHasAmounts: (clientCount: number, debtLabel: string) => string;
  detailBodyEmpty: string;
} {
  if (mode === "opening_carry") {
    return {
      label: "Deuda arrastrada",
      helperText: "Saldo pendiente anterior al período actual",
      detailTitle: "Deuda arrastrada del período anterior",
      detailBodyHasAmounts: (n, debtLabel) =>
        `${n} ${n === 1 ? "cliente tiene" : "clientes tienen"} ${debtLabel} del período anterior. UYU y USD se muestran por separado. Coincide con la fila Anterior en Cartera.`,
      detailBodyEmpty: "No hay saldo arrastrado del período anterior.",
    };
  }
  if (mode === "cartera_aging") {
    return {
      label: "Atrasado +30 días",
      helperText: "Saldos atrasados con más de 30 días.",
      detailTitle: "Atrasado +30 días",
      detailBodyHasAmounts: (n) =>
        `${n} ${n === 1 ? "cliente tiene" : "clientes tienen"} saldo con más de 30 días de atraso según Aging de Cartera. UYU y USD se muestran por separado.`,
      detailBodyEmpty: "No hay saldos con más de 30 días de atraso.",
    };
  }
  return {
    label: "Atrasado",
    helperText: "Facturas con vencimiento anterior a hoy",
    detailTitle: "Atrasado por cobrar",
    detailBodyHasAmounts: (n, debtLabel) =>
      `${n} ${n === 1 ? "cliente tiene" : "clientes tienen"} facturas con ${debtLabel}. UYU y USD se muestran por separado.`,
    detailBodyEmpty: "No hay clientes atrasados. Todos están al día.",
  };
}

function fmtCoverage(r: number): string {
  if (!Number.isFinite(r) || r <= 0 || r > 100) return "—";
  return `${r.toFixed(1)}×`;
}

function plural(n: number, sing: string, plur: string): string {
  return `${n} ${n === 1 ? sing : plur}`;
}

/** Infiere breakdown de vencido cuando los campos per-currency no están disponibles. */
function inferOverdueBreakdown(row: ClientPortfolioRow): MoneyAmount[] {
  if (row.overdue_uyu !== undefined || row.overdue_usd !== undefined) {
    return buildBreakdown(row.overdue_uyu ?? 0, row.overdue_usd ?? 0);
  }
  if (row.overdue_debt <= 0) return [];
  // Si la deuda es solo en una moneda, el vencido también lo es
  if (row.debt_usd === 0) return [makeMoneyAmount(row.overdue_debt, "UYU")];
  if (row.debt_uyu === 0) return [makeMoneyAmount(row.overdue_debt, "USD")];
  // Mixto sin per-currency → asumir UYU (legacy)
  return [makeMoneyAmount(row.overdue_debt, "UYU")];
}

// ─── Snapshot currency ────────────────────────────────────────────────────────

type SnapCurrency = "UYU" | "USD" | "mixed";

function getSnapCurrency(snapshot: FinancialSnapshotApiV1 | null): SnapCurrency {
  const c = snapshot?.meta?.currency;
  if (c === "USD") return "USD";
  if (c === "mixed") return "mixed";
  return "UYU";
}

function fmtSnapAmount(amount: number, snapCurrency: SnapCurrency): string {
  if (snapCurrency === "USD") return fmtCurrencyAmount(amount, "USD");
  return fmtCurrencyAmount(amount, "UYU");
}

// ─── Status determination ─────────────────────────────────────────────────────

import {
  deriveRiskStatus,
  type RiskEngineInput,
} from "@/lib/copilot-risk-engine";

/**
 * Determina el estado del cockpit delegando en el motor único `copilot-risk-engine`.
 * Hoy / Dashboard / Finanzas / Clientes / Alertas comparten estos thresholds.
 */
function determineStatus(p: {
  riskBand: string;
  coverageRatio: number;
  highRiskCount: number;
  overdueCount: number;
}): PulseStatus {
  const input: RiskEngineInput = {
    riskBand: (p.riskBand as RiskEngineInput["riskBand"]) ?? "low",
    coverageRatio: p.coverageRatio,
    highRiskClientCount: p.highRiskCount,
    overdueClientCount: p.overdueCount,
  };
  return deriveRiskStatus(input).status as PulseStatus;
}

// Evita contradicciones: si el estado es healthy, ninguna card puede ser critical
function cappedTone(tone: PulseTone, status: PulseStatus): PulseTone {
  if (status === "healthy" && tone === "critical") return "warning";
  return tone;
}

// ─── Headline ─────────────────────────────────────────────────────────────────

/** Headline ejecutivo: deuda activa vs señales de demora (sin “prioritario”). */
export function buildExecutiveHeadline(
  status: PulseStatus,
  debtorClients: number,
  attentionClients: number,
  riskBand: string,
  coverageRatio: number
): string {
  if (debtorClients === 0) {
    if (status === "critical" && riskBand === "critical")
      return "La empresa enfrenta presión financiera significativa — el flujo de caja requiere atención inmediata.";
    if (status === "critical") return "La situación financiera requiere atención inmediata.";
    if (status === "attention" && coverageRatio > 0 && coverageRatio < 1)
      return "El flujo de caja proyectado está por debajo del objetivo — vale la pena monitorear de cerca.";
    return "La empresa está en buen estado. Todo al día.";
  }
  if (attentionClients > 0) {
    const demora =
      attentionClients === 1
        ? "tiene atraso o señales de demora"
        : "tienen atraso o señales de demora";
    return `Hay ${debtorClients} ${debtorClients === 1 ? "cliente" : "clientes"} con deuda activa. ${attentionClients} ${demora}.`;
  }
  return `Hay ${debtorClients} ${debtorClients === 1 ? "cliente" : "clientes"} con deuda activa.`;
}

export function buildHeroSubline(
  activeClients: number,
  attentionRows: ClientPortfolioRow[]
): string | null {
  if (activeClients <= 0 && attentionRows.length === 0) return null;
  const parts: string[] = [];
  if (attentionRows.length > 0) {
    const overdue = attentionRows.filter(
      (r) =>
        r.overdue_debt > 0 ||
        (r.overdue_uyu ?? 0) > 0 ||
        (r.overdue_usd ?? 0) > 0
    ).length;
    const slow = attentionRows.filter(
      (r) => r.risk === "Alto" || r.payment_behavior === "lento"
    ).length;
    if (overdue > 0 || slow > 0) {
      const bits: string[] = [];
      if (overdue > 0) bits.push(`${overdue} con deuda atrasada`);
      if (slow > 0) bits.push(`${slow} con cobro lento`);
      parts.push(bits.join(" · "));
    } else {
      parts.push(`${attentionRows.length} con señales de atraso`);
    }
  }
  if (activeClients > 0) parts.push(`${activeClients} clientes activos`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** @deprecated Preferir buildExecutiveHeadline en /copilot/hoy. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildHeadline(
  status: PulseStatus,
  overdueCount: number,
  highRiskCount: number,
  riskBand: string,
  coverageRatio: number,
  debtPhrase: string
): string {
  if (status === "critical") {
    if (riskBand === "critical")
      return "La empresa enfrenta presión financiera significativa — el flujo de caja requiere atención inmediata.";
    if (overdueCount >= 3)
      return `Hay ${plural(overdueCount, "cliente", "clientes")} con ${debtPhrase} — situación que requiere atención urgente.`;
    if (highRiskCount >= 3)
      return `${plural(highRiskCount, "cliente", "clientes")} con cobro muy lento — revisar su situación crediticia.`;
    return "La situación financiera requiere atención inmediata.";
  }
  if (status === "attention") {
    if (overdueCount > 0 && highRiskCount > 0)
      return `Hay ${plural(overdueCount, "cliente", "clientes")} con ${debtPhrase} y ${plural(highRiskCount, "cliente", "clientes")} con cobro lento — hace falta seguimiento.`;
    if (overdueCount > 0)
      return `Hay ${plural(overdueCount, "cliente", "clientes")} con ${debtPhrase} — es buen momento para gestionar cobros.`;
    if (coverageRatio > 0 && coverageRatio < 1.0)
      return "El flujo de caja proyectado está por debajo del objetivo — vale la pena monitorear de cerca.";
    if (highRiskCount > 0)
      return `${plural(highRiskCount, "cliente", "clientes")} con cobro lento — conviene revisar su situación.`;
    return "La empresa está operativa. Hay algunas señales que conviene revisar.";
  }
  return "La empresa está en buen estado. Todo bajo control.";
}

// ─── Summary bullets ──────────────────────────────────────────────────────────

function buildSummaryBullets(p: {
  totalClients: number;
  clientsNeedingAttention: number;
  overdueCount: number;
  highRiskCount: number;
  debtPhrase: string;
}): string[] {
  const bullets: string[] = [];

  if (p.totalClients > 0)
    bullets.push(plural(p.totalClients, "cliente activo en cartera", "clientes activos en cartera"));

  if (p.overdueCount > 0)
    bullets.push(
      plural(
        p.overdueCount,
        `cliente con ${p.debtPhrase}`,
        `clientes con ${p.debtPhrase}`
      )
    );

  if (p.clientsNeedingAttention > 0 && p.clientsNeedingAttention !== p.overdueCount)
    bullets.push(plural(p.clientsNeedingAttention, "cliente requiere seguimiento", "clientes requieren seguimiento"));

  if (p.highRiskCount > 0)
    bullets.push(plural(p.highRiskCount, "cliente con cobro lento", "clientes con cobro lento"));

  return bullets.slice(0, 4);
}

// ─── Key indicators ───────────────────────────────────────────────────────────

function buildOperationalIndicators(p: {
  totalClients: number;
  clientsNeedingAttention: number;
  confidence: "high" | "medium" | "low";
  overallStatus: PulseStatus;
}): KeyIndicator[] {
  const all = rawKeyIndicators({
    cashNet: 0,
    snapCurrency: "UYU",
    debtBreakdown: [],
    overdueSemantics: {
      mode: "portfolio_due",
      breakdown: [],
      clientCount: 0,
      debtLabel: "deuda atrasada",
    },
    totalClients: p.totalClients,
    clientsNeedingAttention: p.clientsNeedingAttention,
    coverageRatio: 0,
    confidence: p.confidence,
  });
  return all
    .filter((ind) => ind.id === "clients")
    .map((ind) => ({ ...ind, tone: cappedTone(ind.tone, p.overallStatus) }));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildKeyIndicators(p: {
  cashNet: number;
  snapCurrency: SnapCurrency;
  debtBreakdown: MoneyAmount[];
  overdueSemantics: OverdueDisplaySemantics;
  totalClients: number;
  clientsNeedingAttention: number;
  coverageRatio: number;
  confidence: "high" | "medium" | "low";
  overallStatus: PulseStatus;
}): KeyIndicator[] {
  const raw = rawKeyIndicators(p);
  return raw.map((ind) => ({ ...ind, tone: cappedTone(ind.tone, p.overallStatus) }));
}

function rawKeyIndicators(p: {
  cashNet: number;
  snapCurrency: SnapCurrency;
  debtBreakdown: MoneyAmount[];
  overdueSemantics: OverdueDisplaySemantics;
  totalClients: number;
  clientsNeedingAttention: number;
  coverageRatio: number;
  confidence: "high" | "medium" | "low";
}): KeyIndicator[] {
  const overdueCopyMeta = overdueCopy(p.overdueSemantics.mode);
  const overdueBreakdown = p.overdueSemantics.breakdown;
  const overdueCount = p.overdueSemantics.clientCount;
  // ─ Flujo de caja (snapshot) ─────────────────────────────────────────────────
  const cashTone: PulseTone = p.cashNet > 0 ? "ok" : p.cashNet < 0 ? "critical" : "neutral";
  const cashValueStr = p.cashNet !== 0 ? fmtSnapAmount(p.cashNet, p.snapCurrency) : "Sin datos";
  const cashSubValue = p.snapCurrency === "mixed" ? "Monedas mixtas — ver desglose en Cartera" : undefined;

  // ─ Cobranza pendiente (portfolio) ────────────────────────────────────────────
  const hasDebt = p.debtBreakdown.length > 0;
  const collectionsTone: PulseTone = hasDebt ? "warning" : "ok";

  // ─ Clientes con atención ─────────────────────────────────────────────────────
  const clientsTone: PulseTone =
    p.clientsNeedingAttention >= 3 ? "critical" : p.clientsNeedingAttention > 0 ? "warning" : "ok";

  // ─ Deuda vencida / arrastrada (Aging Cartera o portfolio) ─────────────────────
  const hasOverdue = overdueBreakdown.length > 0;
  const overdueTone: PulseTone =
    overdueCount >= 3 ? "critical" : overdueCount > 0 ? "warning" : "ok";
  const overdueEmptyValue =
    p.overdueSemantics.mode === "opening_carry"
      ? "Sin deuda arrastrada"
      : p.overdueSemantics.mode === "cartera_aging"
        ? "Sin deuda crítica +30 días"
        : "Sin deuda atrasada";

  // ─ Capacidad de pago ──────────────────────────────────────────────────────────
  const noData = !p.coverageRatio || p.coverageRatio <= 0;
  const coverageTone: PulseTone = noData
    ? "neutral"
    : p.coverageRatio >= 1.5
      ? "ok"
      : p.coverageRatio >= 1.0
        ? "warning"
        : "critical";
  const coverageValue = noData ? "Sin señales críticas" : fmtCoverage(p.coverageRatio);
  const coverageSubValue = noData
    ? "Cobertura sin datos suficientes"
    : p.coverageRatio >= 1.0
      ? "Dentro del objetivo"
      : "Por debajo del objetivo";

  // ─ Estado de datos ────────────────────────────────────────────────────────────
  const dataTone: PulseTone =
    p.confidence === "high" ? "ok" : p.confidence === "medium" ? "neutral" : "warning";
  const dataValue =
    p.confidence === "high" ? "Actualizados" : p.confidence === "medium" ? "Revisar" : "Pendiente";

  return [
    {
      id: "cash_flow",
      label: "Cobros",
      value: cashValueStr,
      subValue: cashSubValue,
      tone: cashTone,
      helperText: "Cobros menos pagos — acumulado histórico",
      deepLink: "/copilot/cartera",
      detailTitle: "Neto acumulado de cobros y pagos",
      detailBody:
        p.cashNet > 0
          ? `El neto acumulado es ${fmtSnapAmount(p.cashNet, p.snapCurrency)} — los cobros totales registrados superan los pagos.`
          : p.cashNet < 0
            ? `Los pagos totales registrados superan los cobros acumulados en ${fmtSnapAmount(Math.abs(p.cashNet), p.snapCurrency)}. Conviene revisar la gestión de cobros.`
            : "Sin datos suficientes para calcular el neto de cobros y pagos.",
    },
    {
      id: "collections",
      label: "Cobranza pendiente",
      value: hasDebt ? "" : "Sin deuda activa",
      currencyValues: p.debtBreakdown,
      tone: collectionsTone,
      helperText: "Saldo de facturas abiertas al día de hoy",
      deepLink: "/copilot/cartera",
      detailTitle: "Cobranza pendiente de clientes",
      detailBody: hasDebt
        ? `Saldo total de facturas abiertas al día de hoy. Los valores UYU y USD se muestran por separado. Coincide con el saldo pendiente en Cartera.`
        : "No hay facturas abiertas pendientes de cobro.",
    },
    {
      id: "clients",
      label: "Clientes con atención",
      value: p.clientsNeedingAttention > 0 ? String(p.clientsNeedingAttention) : "Sin señales",
      subValue:
        p.clientsNeedingAttention > 0
          ? `de ${p.totalClients} clientes activos`
          : `${p.totalClients} clientes activos`,
      tone: clientsTone,
      helperText: "Clientes con deuda atrasada o cobro lento",
      deepLink: "/copilot/clientes",
      detailTitle: "Clientes que requieren atención",
      detailBody:
        p.clientsNeedingAttention > 0
          ? `${p.clientsNeedingAttention} de ${p.totalClients} clientes tienen deuda atrasada o historial de cobro lento.`
          : `Los ${p.totalClients} clientes activos no muestran señales de alerta relevantes.`,
    },
    {
      id: "overdue",
      label: overdueCopyMeta.label,
      value: hasOverdue ? "" : overdueEmptyValue,
      currencyValues: overdueBreakdown,
      subValue: hasOverdue ? plural(overdueCount, "cliente", "clientes") : undefined,
      tone: overdueTone,
      helperText: overdueCopyMeta.helperText,
      deepLink: "/copilot/cartera",
      detailTitle: overdueCopyMeta.detailTitle,
      detailBody: hasOverdue
        ? overdueCopyMeta.detailBodyHasAmounts(overdueCount, p.overdueSemantics.debtLabel)
        : overdueCopyMeta.detailBodyEmpty,
    },
    {
      id: "coverage",
      label: "Capacidad de pago",
      value: coverageValue,
      subValue: coverageSubValue,
      tone: coverageTone,
      helperText: "Proyección estimada · cobros esperados vs. pagos programados",
      deepLink: "/copilot/cartera",
      detailTitle: "Capacidad de pago proyectada",
      detailBody: noData
        ? "Sin datos suficientes para proyectar la capacidad de pago. Revisá el estado financiero en Cartera."
        : p.coverageRatio >= 1.5
          ? `Con ${fmtCoverage(p.coverageRatio)}, los cobros esperados cubren ampliamente los pagos programados.`
          : p.coverageRatio >= 1.0
            ? `La capacidad de pago es ${fmtCoverage(p.coverageRatio)} — ajustada pero dentro del rango aceptable.`
            : `La capacidad de pago es ${fmtCoverage(p.coverageRatio)} — los pagos programados superan los cobros esperados. Requiere atención.`,
    },
    {
      id: "data_status",
      label: "Actualización de datos",
      value: dataValue,
      tone: dataTone,
      helperText: "Actualización de la información al día de hoy",
      deepLink: "/copilot/alertas",
      detailTitle: "Estado de la información",
      detailBody:
        p.confidence === "high"
          ? "La información financiera está completa y actualizada. Los indicadores reflejan la situación real."
          : p.confidence === "medium"
            ? "Parte de la información puede estar pendiente de actualización. Los indicadores son orientativos."
            : "Hay datos pendientes de actualización. Los indicadores principales siguen disponibles, pero pueden ser estimativos.",
    },
  ];
}

// ─── Priority collections ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildPriorityCollections(
  rows: ClientPortfolioRow[],
  overdueSemantics: OverdueDisplaySemantics
): PriorityCollection[] {
  const debtLabel = overdueSemantics.debtLabel;
  const isCarry = overdueSemantics.mode === "opening_carry";

  return rows
    .filter((r) => r.total_debt > 0 || r.overdue_debt > 0)
    .sort((a, b) => (b.overdue_debt || b.total_debt) - (a.overdue_debt || a.total_debt))
    .slice(0, 5)
    .map((r) => {
      const accion =
        r.overdue_debt > 0 && r.risk === "Alto"
          ? isCarry
            ? `Contactar urgente — ${debtLabel} con cobro lento`
            : "Contactar urgente — deuda atrasada con cobro lento"
          : r.overdue_debt > 0
            ? isCarry
              ? `Gestionar cobro de ${debtLabel}`
              : "Gestionar cobro de deuda atrasada"
            : r.risk === "Alto"
              ? "Revisar situación de crédito"
              : "Hacer seguimiento de cobro";

      return {
        company_id: r.company_id,
        name: r.name,
        deuda: r.total_debt,
        vencido: r.overdue_debt,
        riesgo: r.risk,
        accion,
        deepLink: `/copilot/clientes/${r.company_id}`,
        deuda_breakdown: buildBreakdown(r.debt_uyu, r.debt_usd),
        vencido_breakdown: inferOverdueBreakdown(r),
      };
    });
}

// ─── Pending items ────────────────────────────────────────────────────────────

function buildPendingItems(p: {
  portfolioRows: ClientPortfolioRow[];
  gate: BusinessPulseGate;
  overdueSemantics: OverdueDisplaySemantics;
}): PendingItem[] {
  const items: PendingItem[] = [];
  const isCarry = p.overdueSemantics.mode === "opening_carry";
  const overdueTitleSuffix = isCarry ? "deuda arrastrada" : "deuda atrasada";
  const overdueTitleNormal = isCarry ? "saldo arrastrado" : "saldo vencido";

  // Clientes con vencido + cobro lento → urgente
  const overdueHighRisk = p.portfolioRows
    .filter((r) => r.overdue_debt > 0 && r.risk === "Alto")
    .sort((a, b) => b.overdue_debt - a.overdue_debt)
    .slice(0, 3);

  for (const r of overdueHighRisk) {
    const breakdown = inferOverdueBreakdown(r);
    const primary =
      breakdown.length === 1
        ? breakdown[0]!
        : breakdown.length > 0
          ? breakdown.sort((a, b) => b.amount - a.amount)[0]!
          : null;
    const impacto = breakdown.length > 0
      ? breakdown.map((v) => v.formatted).join(" + ")
      : fmtCurrencyAmount(r.overdue_debt, r.debt_usd === 0 ? "UYU" : "USD");
    items.push({
      id: `overdue_high_${r.company_id}`,
      title: primary
        ? `${r.name} — ${primary.formatted} vencido`
        : `${r.name} — ${overdueTitleSuffix}`,
      impacto,
      accion: "Contactar y gestionar cobro",
      deepLink: `/copilot/clientes/${r.company_id}`,
      urgency: "alta",
    });
  }

  // Clientes con vencido normal → seguimiento
  const overdueNormal = p.portfolioRows
    .filter((r) => r.overdue_debt > 0 && r.risk !== "Alto")
    .sort((a, b) => b.overdue_debt - a.overdue_debt)
    .slice(0, 2);

  for (const r of overdueNormal) {
    const breakdown = inferOverdueBreakdown(r);
    const primary =
      breakdown.length === 1
        ? breakdown[0]!
        : breakdown.length > 0
          ? breakdown.sort((a, b) => b.amount - a.amount)[0]!
          : null;
    const impacto = breakdown.length > 0
      ? breakdown.map((v) => v.formatted).join(" + ")
      : fmtCurrencyAmount(r.overdue_debt, r.debt_usd === 0 ? "UYU" : "USD");
    items.push({
      id: `overdue_${r.company_id}`,
      title: primary
        ? `${r.name} — ${primary.formatted} vencido`
        : `${r.name} — ${overdueTitleNormal}`,
      impacto,
      accion: "Hacer seguimiento del cobro",
      deepLink: `/copilot/clientes/${r.company_id}`,
      urgency: "media",
    });
  }

  const slowNoOverdue = p.portfolioRows
    .filter(
      (r) =>
        r.overdue_debt <= 0 &&
        (r.overdue_uyu ?? 0) + (r.overdue_usd ?? 0) <= 0 &&
        (r.risk === "Alto" || r.payment_behavior === "lento") &&
        r.total_debt > 0
    )
    .slice(0, 1);

  for (const r of slowNoOverdue) {
    const debtLine =
      (r.debt_uyu ?? 0) > 0 && (r.debt_usd ?? 0) > 0
        ? `${fmtCurrencyAmount(r.debt_uyu!, "UYU")} + ${fmtCurrencyAmount(r.debt_usd!, "USD")}`
        : (r.debt_usd ?? 0) > 0
          ? fmtCurrencyAmount(r.debt_usd!, "USD")
          : fmtCurrencyAmount(r.debt_uyu ?? r.total_debt, "UYU");
    items.push({
      id: `slow_${r.company_id}`,
      title: `${r.name} — cobro lento`,
      impacto: `${debtLine} pendiente`,
      accion: "Revisar situación de crédito y plan de cobro",
      deepLink: `/copilot/clientes/${r.company_id}`,
      urgency: "media",
    });
  }

  // Sin contacto
  const noContact = p.portfolioRows
    .filter((r) => !r.has_contact_data && r.total_debt > 0)
    .slice(0, 2);

  for (const r of noContact) {
    items.push({
      id: `no_contact_${r.company_id}`,
      title: `${r.name} — sin contacto registrado`,
      impacto: "Sin contacto es difícil gestionar el cobro",
      accion: "Registrar un contacto para este cliente",
      deepLink: `/copilot/clientes/${r.company_id}`,
      urgency: "baja",
    });
  }

  const financial = items.filter((i) => i.id !== "data_quality");
  const operational =
    p.gate.confidence === "low" && p.gate.coverage === "insufficient"
      ? [
          {
            id: "data_quality",
            title: "Revisar actualización de datos",
            impacto: "Información secundaria pendiente de actualizar",
            accion: "Ver alertas",
            deepLink: "/copilot/alertas",
            urgency: "baja" as const,
          },
        ]
      : [];

  return [...financial.slice(0, 3), ...operational].slice(0, 4);
}

// ─── Last 30 days summary ─────────────────────────────────────────────────────

function buildLast30DaysSummary(
  snapshot: FinancialSnapshotApiV1 | null,
  snapCurrency: SnapCurrency
): SummaryItem[] {
  if (!snapshot) return [];
  const cashNet = snapshotCashNet(snapshot);
  const receiptsGross = snapshot.realized?.receipts_gross ?? 0;
  const outflows = snapshotExpectedOutflowsTotal(snapshot);
  const liquidity = snapshotLiquidityBalance(snapshot);
  const mixedNote = snapCurrency === "mixed" ? " (monedas mixtas)" : "";

  return [
    {
      label: "Cobros acumulados",
      value: fmtSnapAmount(receiptsGross, snapCurrency),
      trend: receiptsGross > 0 ? "up" : "neutral",
      description: "Recibos registrados desde el inicio" + mixedNote,
    },
    {
      label: "Neto acumulado",
      value: fmtSnapAmount(cashNet, snapCurrency),
      trend: cashNet > 0 ? "up" : cashNet < 0 ? "down" : "neutral",
      description: "Diferencia acumulada entre cobros y pagos" + mixedNote,
    },
    {
      label: "Pagos pendientes",
      value: fmtSnapAmount(outflows, snapCurrency),
      trend: outflows > receiptsGross ? "down" : "neutral",
      description: "Pagos con fecha posterior a hoy" + mixedNote,
    },
    {
      label: "Balance proyectado",
      value: fmtSnapAmount(liquidity, snapCurrency),
      trend: liquidity > 0 ? "up" : liquidity < 0 ? "down" : "neutral",
      description: "Caja disponible Santander + cobros esperados − pagos programados" + mixedNote,
    },
  ];
}

// ─── Recommended actions ──────────────────────────────────────────────────────

function buildRecommendedActions(p: {
  status: PulseStatus;
  overdueCount: number;
  highRiskCount: number;
  confidence: "high" | "medium" | "low";
}): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  if (p.overdueCount > 0) {
    actions.push({
      id: "review_overdue",
      label: "Revisar cobranza prioritaria",
      deepLink: "/copilot/cartera",
      tone: p.status === "critical" ? "critical" : "warning",
    });
  }

  if (p.highRiskCount > 0) {
    actions.push({
      id: "review_risk_clients",
      label: "Ver clientes con cobro lento",
      deepLink: "/copilot/clientes",
      tone: "warning",
    });
  }

  actions.push({
    id: "financial_detail",
    label: "Ver estado financiero",
    deepLink: "/copilot/cartera",
    tone: "neutral",
  });

  if (p.confidence === "low") {
    actions.push({
      id: "update_data",
      label: "Actualizar información",
      deepLink: "/copilot/alertas",
      tone: "neutral",
    });
  }

  return actions.slice(0, 4);
}

// ─── Data warning ─────────────────────────────────────────────────────────────

function buildDataWarning(gate: BusinessPulseGate, isTruncated: boolean): string | null {
  if (gate.confidence === "low")
    return "Algunos datos secundarios están pendientes de actualización. Los saldos principales están disponibles.";
  if (isTruncated)
    return "Algunos registros están siendo procesados. Los números pueden ser estimativos.";
  return null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildTodayBusinessPulse(input: BusinessPulseInput): TodayBusinessPulse {
  const rows = input.portfolioRows ?? [];
  const snapCurrency = getSnapCurrency(input.snapshot);
  const overdueSemantics = resolveOverdueDisplaySemantics(input);

  // Snapshot metrics
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const cashNet = input.snapshot ? snapshotCashNet(input.snapshot) : 0;
  const coverageRatio = input.snapshot ? snapshotCoverageRatio(input.snapshot) : 0;
  const riskBand: string = input.snapshot ? snapshotRiskBand(input.snapshot) : "low";
  const isTruncated = input.snapshot ? snapshotIsTruncated(input.snapshot) : false;

  // Portfolio totals per currency — rollup canónico si hay reporte all_outstanding
  const portfolioPending = resolveCanonicalActiveDebt({
    outstandingReportCurrencies: input.outstandingReportCurrencies,
    portfolioRows: rows,
  });

  // Portfolio counts
  const highRiskClients = rows.filter((r) => r.risk === "Alto");
  const overdueClients = rows.filter((r) => r.overdue_debt > 0);
  const attentionRows = rows.filter((r) =>
    clientQualifiesForAttention(r, input.gate.confidence)
  );
  const debtorClientsCount = countActiveDebtorClients(rows);
  const overdueSignalCount =
    overdueSemantics.breakdown.length > 0
      ? overdueSemantics.clientCount
      : overdueClients.length;

  const overallStatus = determineStatus({
    riskBand,
    coverageRatio,
    highRiskCount: highRiskClients.length,
    overdueCount: overdueSignalCount,
  });

  const aging = extractAgingTotals(undefined, input.carteraAgingOverdue);
  const agingCurrent = input.carteraAgingCurrent ?? aging.current;

  const treasurySummaries = input.treasuryOutflowSummaries ?? [];
  const cashPositions = input.treasuryCashPositions;
  const asOfDate = input.today ?? new Date().toISOString().slice(0, 10);
  const periodRange =
    input.periodRange ?? { from: asOfDate.slice(0, 8) + "01", to: asOfDate };

  const cashPositionBlocks = buildHoyCashPositionBlocks({
    cashPositions,
    pendingByCurrency: portfolioPending,
    treasurySummaries,
  });

  const periodActivity = buildHoyPeriodActivity(
    periodRange,
    input.periodReportCurrencies ?? [],
    input.manualCashMovements ?? []
  );
  const periodActivityBlocks = buildHoyPeriodActivityBlocks(periodActivity);

  const debtorCounts = countDebtorsByCurrency(rows);
  const currentScope = buildHoyCurrentScope({
    asOfDate,
    portfolioPending,
    agingOverdue30: input.carteraAgingOverdue ?? aging.critical,
    agingCurrent,
    debtorCounts,
    cashBlocks: cashPositionBlocks,
  });
  const currentStateBlocks = buildHoyCurrentStateBlocks(cashPositionBlocks, currentScope);

  const projection30dBlocks = buildHoyProjection30dBlocks({
    cashPositionBlocks,
    pendingByCurrency: portfolioPending,
    treasurySummaries,
  });

  /** Bloques legacy (tests Cartera): prioriza actividad del período; fallback `carteraPeriodMetrics`. */
  const periodFromReport =
    periodActivity.billedNetByCurrency.UYU > 0 ||
    periodActivity.billedNetByCurrency.USD > 0 ||
    periodActivity.collectedInPeriodByCurrency.UYU > 0 ||
    periodActivity.collectedInPeriodByCurrency.USD > 0;
  const executivePeriod: CarteraPeriodMetrics | null = periodFromReport
    ? {
        billed: periodActivity.billedNetByCurrency,
        collected: periodActivity.collectedInPeriodByCurrency,
        pending: portfolioPending,
      }
    : (input.carteraPeriodMetrics ?? null);

  const currencyBlocks = buildCurrencyExecutiveBlocks({
    period: executivePeriod,
    portfolioPending,
    agingCritical30: input.carteraAgingOverdue ?? aging.critical,
    agingCurrent,
    debtorCounts,
    treasurySummaries: [],
    treasuryCashPositions: [],
  });

  const manualExpenseInPeriod: CarteraCurrencyTotals = {
    UYU: cashPositions?.find((p) => p.currency === "UYU")?.manualExpenseInRange ?? 0,
    USD: cashPositions?.find((p) => p.currency === "USD")?.manualExpenseInRange ?? 0,
  };

  const treasuryAlerts = buildHoyTreasuryAlerts({
    projectionBlocks: projection30dBlocks,
    summaries: treasurySummaries,
    overdueCritical30: input.carteraAgingOverdue ?? aging.critical,
    manualExpenseInPeriod,
    cashPositionBlocks,
  });
  const treasuryOutflowsConfigured = treasurySummaries.some((s) => s.itemsCount > 0);

  const allDebtorRows = buildDebtorCollectionRows(rows);
  const operationalIndicators = buildOperationalIndicators({
    totalClients: rows.length,
    clientsNeedingAttention: attentionRows.length,
    confidence: input.gate.confidence,
    overallStatus,
  });

  const attentionClients = buildAttentionClientsSummary(
    rows,
    input.gate.confidence,
    debtorClientsCount
  );
  const financialSituation = buildFinancialSituationBlocks(
    input.snapshot,
    input.carteraPeriodMetrics ?? null,
    portfolioPending
  );

  return {
    overallStatus,
    headline: buildExecutiveHeadline(
      overallStatus,
      debtorClientsCount,
      attentionRows.length,
      riskBand,
      coverageRatio
    ),
    heroSubline: buildHeroSubline(rows.length, attentionRows),
    clientCounts: {
      activeClients: rows.length,
      debtorClients: debtorClientsCount,
      attentionClients: attentionRows.length,
      debtorRows: allDebtorRows.length,
    },
    summaryBullets: buildSummaryBullets({
      totalClients: rows.length,
      clientsNeedingAttention: attentionRows.length,
      overdueCount: overdueSignalCount,
      highRiskCount: highRiskClients.length,
      debtPhrase: overdueSemantics.debtLabel,
    }),
    currencyBlocks,
    operationalIndicators,
    keyIndicators: operationalIndicators,
    priorityCollections: debtorRowsToPriorityCollections(
      allDebtorRows,
      HOY_PRIORITY_TABLE_TOP
    ),
    allDebtorRows,
    attentionClients,
    financialSituation,
    importantPendingItems: buildPendingItems({
      portfolioRows: rows,
      gate: input.gate,
      overdueSemantics,
    }),
    last30DaysSummary: buildLast30DaysSummary(input.snapshot, snapCurrency),
    recommendedActions: buildRecommendedActions({
      status: overallStatus,
      overdueCount: overdueClients.length,
      highRiskCount: highRiskClients.length,
      confidence: input.gate.confidence,
    }),
    dataWarning: buildDataWarning(input.gate, isTruncated),
    treasuryAlerts,
    treasuryOutflowsConfigured,
    cashPositionBlocks,
    projection30dBlocks,
    periodRange,
    currentScope,
    currentStateBlocks,
    periodActivity,
    periodActivityBlocks,
  };
}
