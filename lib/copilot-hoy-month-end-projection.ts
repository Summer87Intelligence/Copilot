/**
 * Proyección mensual simple para Hoy (FEATURE-001A / 001B).
 * Caja cierre = Caja hoy + Cobros estimados (según escenario) − Pagos programados.
 * Sin IA. UYU y USD siempre separados.
 */

import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import type { HoyCashPositionBlock } from "@/lib/copilot-hoy-treasury";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type {
  TreasuryOutflowSummary,
  TreasuryScheduledPayment,
} from "@/lib/treasury/treasury-scheduled-payments";
import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

export type MonthEndScenario = "conservative" | "expected" | "optimistic";

export const MONTH_END_SCENARIOS: readonly MonthEndScenario[] = [
  "conservative",
  "expected",
  "optimistic",
];

export const DEFAULT_MONTH_END_SCENARIO: MonthEndScenario = "expected";

export const MONTH_END_SCENARIO_COLLECTION_RATE: Record<MonthEndScenario, number> = {
  conservative: 0.5,
  expected: 0.75,
  optimistic: 1,
};

export const MONTH_END_SCENARIO_LABEL: Record<MonthEndScenario, string> = {
  conservative: "Conservador",
  expected: "Esperado",
  optimistic: "Optimista",
};

export type MonthEndRiskLevel = "healthy" | "attention" | "critical";

/** Margen mínimo saludable: caja proyectada debe superar este % de pagos de referencia. */
export const MONTH_END_ATTENTION_MARGIN_RATE = 0.15;

export type HoyMonthEndRiskFinding = {
  currency: TreasuryCurrencyCode;
  date: string;
  dateLabel: string;
  level: MonthEndRiskLevel;
  reason: string;
  projectedAmount: number;
};

export type HoyMonthEndCurrencyBlock = {
  currency: TreasuryCurrencyCode;
  availableCash: number;
  pendingReceivables: number;
  /** Cobros estimados al cierre según escenario (pendiente × %). */
  estimatedCollectionsMonth: number;
  scheduledOutflowsMonth: number;
  monthEndCash: number;
  deltaVsToday: number;
  hasConfiguredPayments: boolean;
  risk: MonthEndRiskLevel;
};

export type HoyMonthEndFridayCell = {
  date: string;
  label: string;
  isMonthEnd: boolean;
  closingCash: Record<TreasuryCurrencyCode, number>;
  cumulativeInflows: Record<TreasuryCurrencyCode, number>;
  cumulativeOutflows: Record<TreasuryCurrencyCode, number>;
  riskByCurrency: Record<TreasuryCurrencyCode, MonthEndRiskLevel>;
};

export type HoyMonthEndDrawerLine = {
  id: string;
  label: string;
  uyu: number | null;
  usd: number | null;
  note?: string;
};

export type HoyMonthEndProjection = {
  asOfDate: string;
  monthEndDate: string;
  monthLabel: string;
  scenario: MonthEndScenario;
  collectionRate: number;
  collectionRatePct: number;
  currencyBlocks: HoyMonthEndCurrencyBlock[];
  fridayStrip: HoyMonthEndFridayCell[];
  drawer: {
    headline: string;
    disclaimer: string;
    lines: HoyMonthEndDrawerLine[];
    causes: string[];
    riskFindings: HoyMonthEndRiskFinding[];
  };
};

export type HoyMonthEndProjectionBundle = {
  defaultScenario: MonthEndScenario;
  scenarios: Record<MonthEndScenario, HoyMonthEndProjection | null>;
};

const CURRENCIES: TreasuryCurrencyCode[] = ["UYU", "USD"];

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function utcMs(ymd: string): number {
  return Date.parse(`${ymd}T12:00:00.000Z`);
}

export function monthEndYmd(asOfDate: string): string {
  const p = parseYmd(asOfDate);
  if (!p) return asOfDate;
  const last = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

export function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const a = utcMs(fromYmd);
  const b = utcMs(toYmd);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function daysUntilMonthEnd(asOfDate: string): number {
  return daysBetweenYmd(asOfDate, monthEndYmd(asOfDate));
}

export function monthLabelEs(ymd: string): string {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  return MONTH_NAMES[p.m - 1] ?? ymd;
}

function formatShortDateEs(ymd: string): string {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  return `${p.d}/${String(p.m).padStart(2, "0")}`;
}

function fridayLabel(ymd: string): string {
  return `Vie ${formatShortDateEs(ymd)}`;
}

export function listExecutiveMonthDates(asOfDate: string): Array<{ date: string; isMonthEnd: boolean }> {
  const monthEnd = monthEndYmd(asOfDate);
  const fridays: string[] = [];
  const p = parseYmd(asOfDate);
  if (!p) return [{ date: monthEnd, isMonthEnd: true }];

  const cursor = new Date(Date.UTC(p.y, p.m - 1, p.d));
  const endMs = utcMs(monthEnd);

  while (cursor.getTime() <= endMs) {
    if (cursor.getUTCDay() === 5) {
      const y = cursor.getUTCFullYear();
      const mo = cursor.getUTCMonth() + 1;
      const d = cursor.getUTCDate();
      const ymd = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (ymd >= asOfDate) fridays.push(ymd);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const picked = fridays.slice(0, 4);
  const out: Array<{ date: string; isMonthEnd: boolean }> = picked.map((date) => ({
    date,
    isMonthEnd: date === monthEnd,
  }));

  if (!picked.includes(monthEnd)) {
    out.push({ date: monthEnd, isMonthEnd: true });
  }

  return out;
}

function isScheduledPaymentPending(item: TreasuryScheduledPayment): boolean {
  return item.status !== "paid" && item.status !== "cancelled";
}

export function sumScheduledOutflowsThroughDate(
  items: readonly TreasuryScheduledPayment[],
  throughDate: string,
  currency: TreasuryCurrencyCode
): number {
  let sum = 0;
  for (const item of items) {
    if (item.currency !== currency) continue;
    if (!isScheduledPaymentPending(item)) continue;
    if (item.dueDate > throughDate) continue;
    sum += item.amount;
  }
  return roundMoney(sum);
}

function estimatedCollectionsAtMonthEnd(pending: number, collectionRate: number): number {
  if (pending <= 0 || collectionRate <= 0) return 0;
  return roundMoney(pending * collectionRate);
}

function assumedInflowsThroughDate(
  estimatedMonthCollections: number,
  asOfDate: string,
  throughDate: string
): number {
  const monthEnd = monthEndYmd(asOfDate);
  const target = throughDate > monthEnd ? monthEnd : throughDate;
  const totalDays = daysUntilMonthEnd(asOfDate);
  if (estimatedMonthCollections <= 0) return 0;
  if (totalDays <= 0) return estimatedMonthCollections;
  const elapsed = daysBetweenYmd(asOfDate, target);
  const fraction = Math.min(1, Math.max(0, elapsed / totalDays));
  return roundMoney(estimatedMonthCollections * fraction);
}

/**
 * Clasifica riesgo en un punto (cierre de mes o viernes) para una moneda.
 * Sin pagos de referencia: estable si caja >= 0; crítico si caja < 0.
 */
export function classifyMonthEndCashRisk(
  closingCash: number,
  referencePayments: number
): MonthEndRiskLevel {
  if (closingCash < 0) return "critical";
  if (referencePayments <= 0) return "healthy";
  if (closingCash < referencePayments * MONTH_END_ATTENTION_MARGIN_RATE) return "attention";
  return "healthy";
}

export function monthEndRiskLevelLabel(level: MonthEndRiskLevel): string {
  if (level === "critical") return "Crítico";
  if (level === "attention") return "Atención";
  return "Estable";
}

export function monthEndRiskShortNote(level: MonthEndRiskLevel): string {
  if (level === "critical") return "Caja negativa";
  if (level === "attention") return "Margen bajo";
  return "Sin alerta";
}

export function monthEndRiskReasonText(
  level: MonthEndRiskLevel,
  context: "month_end" | "checkpoint"
): string {
  if (level === "critical") {
    return context === "month_end"
      ? "caja negativa proyectada al cierre"
      : "caja negativa en la estimación";
  }
  return "margen bajo frente a pagos programados";
}

function aggregateCurrencyRisk(
  checkpoints: ReadonlyArray<{ closingCash: number; referencePayments: number }>
): MonthEndRiskLevel {
  let risk: MonthEndRiskLevel = "healthy";
  for (const point of checkpoints) {
    risk = worstRisk(
      risk,
      classifyMonthEndCashRisk(point.closingCash, point.referencePayments)
    );
  }
  return risk;
}

function worstRisk(a: MonthEndRiskLevel, b: MonthEndRiskLevel): MonthEndRiskLevel {
  const rank: Record<MonthEndRiskLevel, number> = { healthy: 0, attention: 1, critical: 2 };
  return rank[b] > rank[a] ? b : a;
}

function availableCashForCurrency(
  cashBlocks: readonly HoyCashPositionBlock[],
  cashPositions: readonly CashPositionByCurrency[] | undefined,
  currency: TreasuryCurrencyCode
): number {
  const block = cashBlocks.find((b) => b.currency === currency);
  if (block) return block.availableCash;
  return cashPositions?.find((p) => p.currency === currency)?.availableCash ?? 0;
}

function buildRiskFindings(
  currencyBlocks: readonly HoyMonthEndCurrencyBlock[],
  fridayStrip: readonly HoyMonthEndFridayCell[],
  monthEndDate: string
): HoyMonthEndRiskFinding[] {
  const findings: HoyMonthEndRiskFinding[] = [];

  for (const block of currencyBlocks) {
    const monthRisk = classifyMonthEndCashRisk(
      block.monthEndCash,
      block.scheduledOutflowsMonth
    );
    if (monthRisk !== "healthy") {
      findings.push({
        currency: block.currency,
        date: monthEndDate,
        dateLabel: "Cierre",
        level: monthRisk,
        reason: monthEndRiskReasonText(monthRisk, "month_end"),
        projectedAmount: block.monthEndCash,
      });
    }
  }

  for (const cell of fridayStrip) {
    for (const currency of CURRENCIES) {
      const block = currencyBlocks.find((b) => b.currency === currency);
      if (!block) continue;

      const level = cell.riskByCurrency[currency];
      if (level === "healthy") continue;

      findings.push({
        currency,
        date: cell.date,
        dateLabel: cell.label,
        level,
        reason: monthEndRiskReasonText(level, "checkpoint"),
        projectedAmount: cell.closingCash[currency],
      });
    }
  }

  const rank: Record<MonthEndRiskLevel, number> = { critical: 0, attention: 1, healthy: 2 };
  return findings.sort((a, b) => {
    const byLevel = rank[a.level] - rank[b.level];
    if (byLevel !== 0) return byLevel;
    if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
    return a.date.localeCompare(b.date);
  });
}

function buildDrawerCauses(p: {
  blocks: HoyMonthEndCurrencyBlock[];
  summaries: readonly TreasuryOutflowSummary[];
  collectionRatePct: number;
}): string[] {
  const causes: string[] = [];
  for (const block of p.blocks) {
    if (block.scheduledOutflowsMonth > 0) {
      const cat = p.summaries.find((s) => s.currency === block.currency)?.byCategory?.[0];
      if (cat) {
        causes.push(
          `Pagos ${cat.category} en ${block.currency}: ${cat.amount.toLocaleString("es-UY")}`
        );
      } else {
        causes.push(
          `Pagos programados en ${block.currency}: ${block.scheduledOutflowsMonth.toLocaleString("es-UY")}`
        );
      }
    }
    if (block.estimatedCollectionsMonth > 0) {
      causes.push(
        `Cobros estimados (${p.collectionRatePct}%) en ${block.currency}: ${block.estimatedCollectionsMonth.toLocaleString("es-UY")}`
      );
    }
  }
  if (causes.length === 0) {
    causes.push("Sin egresos programados cargados en Tesorería para este mes.");
  }
  return causes.slice(0, 3);
}

function scenarioHeadline(monthName: string, scenario: MonthEndScenario, ratePct: number): string {
  const label = MONTH_END_SCENARIO_LABEL[scenario].toLowerCase();
  return `En el escenario ${label} (${ratePct}% de la deuda pendiente), terminarías ${monthName} con esta caja si se cumplen los pagos programados.`;
}

export type HoyMonthEndProjectionInput = {
  asOfDate: string;
  pendingByCurrency: CarteraCurrencyTotals;
  cashPositionBlocks: readonly HoyCashPositionBlock[];
  treasuryCashPositions?: readonly CashPositionByCurrency[];
  treasurySummaries?: readonly TreasuryOutflowSummary[];
  scheduledPayments?: readonly TreasuryScheduledPayment[];
};

export function buildHoyMonthEndProjection(
  input: HoyMonthEndProjectionInput & { scenario?: MonthEndScenario }
): HoyMonthEndProjection | null {
  const scenario = input.scenario ?? DEFAULT_MONTH_END_SCENARIO;
  const collectionRate = MONTH_END_SCENARIO_COLLECTION_RATE[scenario];
  const collectionRatePct = Math.round(collectionRate * 100);

  const monthEnd = monthEndYmd(input.asOfDate);
  const summaries = input.treasurySummaries ?? [];
  const items = input.scheduledPayments ?? [];
  const hasItems = items.length > 0;

  const currencyBlocks: HoyMonthEndCurrencyBlock[] = [];

  for (const currency of CURRENCIES) {
    const availableCash = availableCashForCurrency(
      input.cashPositionBlocks,
      input.treasuryCashPositions,
      currency
    );
    const pendingReceivables = input.pendingByCurrency[currency] ?? 0;
    const estimatedCollectionsMonth = estimatedCollectionsAtMonthEnd(
      pendingReceivables,
      collectionRate
    );
    const summary = summaries.find((s) => s.currency === currency);
    const hasConfigured = (summary?.itemsCount ?? 0) > 0 || items.some((i) => i.currency === currency);

    const scheduledOutflowsMonth = hasItems
      ? sumScheduledOutflowsThroughDate(items, monthEnd, currency)
      : roundMoney(summary?.next30Days ?? 0);

    const hasActivity =
      availableCash !== 0 ||
      pendingReceivables > 0 ||
      scheduledOutflowsMonth > 0 ||
      hasConfigured;
    if (!hasActivity) continue;

    const monthEndCash = roundMoney(
      availableCash + estimatedCollectionsMonth - scheduledOutflowsMonth
    );

    currencyBlocks.push({
      currency,
      availableCash,
      pendingReceivables,
      estimatedCollectionsMonth,
      scheduledOutflowsMonth,
      monthEndCash,
      deltaVsToday: roundMoney(monthEndCash - availableCash),
      hasConfiguredPayments: hasConfigured,
      risk: "healthy",
    });
  }

  if (currencyBlocks.length === 0) return null;

  const fridayStrip: HoyMonthEndFridayCell[] = listExecutiveMonthDates(input.asOfDate).map(
    ({ date, isMonthEnd }) => {
      const closingCash: Record<TreasuryCurrencyCode, number> = { UYU: 0, USD: 0 };
      const cumulativeInflows: Record<TreasuryCurrencyCode, number> = { UYU: 0, USD: 0 };
      const cumulativeOutflows: Record<TreasuryCurrencyCode, number> = { UYU: 0, USD: 0 };
      const riskByCurrency: Record<TreasuryCurrencyCode, MonthEndRiskLevel> = {
        UYU: "healthy",
        USD: "healthy",
      };

      for (const currency of CURRENCIES) {
        const block = currencyBlocks.find((b) => b.currency === currency);
        if (!block) continue;

        const outflows = hasItems
          ? sumScheduledOutflowsThroughDate(items, date, currency)
          : roundMoney(
              (block.scheduledOutflowsMonth * daysBetweenYmd(input.asOfDate, date)) /
                Math.max(1, daysUntilMonthEnd(input.asOfDate))
            );

        const inflows = assumedInflowsThroughDate(
          block.estimatedCollectionsMonth,
          input.asOfDate,
          date
        );
        const closing = roundMoney(block.availableCash + inflows - outflows);

        closingCash[currency] = closing;
        cumulativeInflows[currency] = inflows;
        cumulativeOutflows[currency] = outflows;
        riskByCurrency[currency] = classifyMonthEndCashRisk(closing, outflows);
      }

      return {
        date,
        label: isMonthEnd ? "Cierre" : fridayLabel(date),
        isMonthEnd,
        closingCash,
        cumulativeInflows,
        cumulativeOutflows,
        riskByCurrency,
      };
    }
  );

  for (const block of currencyBlocks) {
    const checkpoints: Array<{ closingCash: number; referencePayments: number }> = [
      {
        closingCash: block.monthEndCash,
        referencePayments: block.scheduledOutflowsMonth,
      },
      ...fridayStrip.map((cell) => ({
        closingCash: cell.closingCash[block.currency],
        referencePayments: cell.cumulativeOutflows[block.currency],
      })),
    ];
    block.risk = aggregateCurrencyRisk(checkpoints);
  }

  const drawerLines: HoyMonthEndDrawerLine[] = [
    {
      id: "cash-today",
      label: "Caja disponible hoy",
      uyu: currencyBlocks.find((b) => b.currency === "UYU")?.availableCash ?? null,
      usd: currencyBlocks.find((b) => b.currency === "USD")?.availableCash ?? null,
    },
    {
      id: "pending",
      label: "Deuda pendiente de clientes (total)",
      uyu: currencyBlocks.find((b) => b.currency === "UYU")?.pendingReceivables ?? null,
      usd: currencyBlocks.find((b) => b.currency === "USD")?.pendingReceivables ?? null,
      note: "Saldo abierto en Cartera. No todo entra al escenario.",
    },
    {
      id: "estimated-collections",
      label: `Cobros estimados del mes (${collectionRatePct}%)`,
      uyu: currencyBlocks.find((b) => b.currency === "UYU")?.estimatedCollectionsMonth ?? null,
      usd: currencyBlocks.find((b) => b.currency === "USD")?.estimatedCollectionsMonth ?? null,
      note: `Escenario ${MONTH_END_SCENARIO_LABEL[scenario]}: ${collectionRatePct}% de la deuda pendiente, repartido de forma lineal hasta fin de mes.`,
    },
    {
      id: "outflows",
      label: "Pagos programados hasta fin de mes",
      uyu: currencyBlocks.find((b) => b.currency === "UYU")?.scheduledOutflowsMonth ?? null,
      usd: currencyBlocks.find((b) => b.currency === "USD")?.scheduledOutflowsMonth ?? null,
      note: "Igual en todos los escenarios. Fuente: Tesorería.",
    },
    {
      id: "month-end",
      label: "Caja estimada al cierre del mes",
      uyu: currencyBlocks.find((b) => b.currency === "UYU")?.monthEndCash ?? null,
      usd: currencyBlocks.find((b) => b.currency === "USD")?.monthEndCash ?? null,
    },
  ];

  const monthName = monthLabelEs(monthEnd);

  return {
    asOfDate: input.asOfDate,
    monthEndDate: monthEnd,
    monthLabel: monthName,
    scenario,
    collectionRate,
    collectionRatePct,
    currencyBlocks,
    fridayStrip,
    drawer: {
      headline: scenarioHeadline(monthName, scenario, collectionRatePct),
      disclaimer:
        "Estimación operativa para planificar. No es saldo bancario ni garantía de cobro.",
      lines: drawerLines,
      causes: buildDrawerCauses({ blocks: currencyBlocks, summaries, collectionRatePct }),
      riskFindings: buildRiskFindings(currencyBlocks, fridayStrip, monthEnd),
    },
  };
}

export function buildHoyMonthEndProjectionBundle(
  input: HoyMonthEndProjectionInput
): HoyMonthEndProjectionBundle {
  const scenarios = {} as Record<MonthEndScenario, HoyMonthEndProjection | null>;
  for (const scenario of MONTH_END_SCENARIOS) {
    scenarios[scenario] = buildHoyMonthEndProjection({ ...input, scenario });
  }
  return {
    defaultScenario: DEFAULT_MONTH_END_SCENARIO,
    scenarios,
  };
}
