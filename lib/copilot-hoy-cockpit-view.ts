/**
 * Vista cockpit /copilot/hoy — mapeo UI puro desde TodayBusinessPulse (sin cambiar cálculos).
 */

import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import type { DebtorCollectionRow } from "@/lib/copilot-hoy-executive";
import {
  fmtCurrencyAmount,
  type PulseStatus,
  type TodayBusinessPulse,
} from "@/lib/copilot-today-business-pulse";

const RECEIVABLES_DRAWER_CURRENCY_ORDER = ["UYU", "USD"] as const;

/** Top N deudores por moneda (resumen ejecutivo del drawer Por cobrar). */
export function topDebtorRowsPerCurrency(
  rows: DebtorCollectionRow[],
  limitPerCurrency = 5
): DebtorCollectionRow[] {
  const out: DebtorCollectionRow[] = [];
  for (const currency of RECEIVABLES_DRAWER_CURRENCY_ORDER) {
    out.push(...rows.filter((r) => r.currency === currency).slice(0, limitPerCurrency));
  }
  return out;
}

export function groupDebtorRowsByCurrency(
  rows: DebtorCollectionRow[]
): { currency: "UYU" | "USD"; rows: DebtorCollectionRow[] }[] {
  return RECEIVABLES_DRAWER_CURRENCY_ORDER.map((currency) => ({
    currency,
    rows: rows.filter((r) => r.currency === currency),
  })).filter((g) => g.rows.length > 0);
}

export type CockpitCurrencyAmount = {
  currency: "UYU" | "USD";
  amount: number;
  formatted: string;
};

export type CockpitFootnote = {
  tone: "ok" | "warn" | "danger";
  text: string;
};

/** Acento visual de la card «Después de pagos» (derivado de safeCash30d / cobertura). */
export type CockpitAfterPaymentsAccent = "comfortable" | "adjusted" | "critical";

export type CockpitMoneyBlock = {
  amounts: CockpitCurrencyAmount[];
  footnote: CockpitFootnote;
  afterPaymentsAccent?: CockpitAfterPaymentsAccent;
};

export type CockpitQuickInsight = {
  id: string;
  tone: "ok" | "warn" | "danger";
  text: string;
};

export type CockpitHero = {
  status: PulseStatus;
  statusLabel: string;
  headline: string;
  /** Métricas compactas: vencida · cobro lento · activos. */
  metricsLine: string | null;
  operacionalHref: string;
};

export type CockpitReceivablesCard = {
  totalPending: CockpitCurrencyAmount[];
  overdueTotal: CockpitCurrencyAmount[];
  overdue30: CockpitCurrencyAmount[];
  /** Clientes únicos con atraso (opcional, para detalle expandible). */
  overdueClientCount?: number;
  /** Clientes únicos con atraso +30 días (opcional). */
  overdue30ClientCount?: number;
};

export type CockpitView = {
  hero: CockpitHero;
  moneyAvailable: CockpitMoneyBlock;
  receivables: CockpitReceivablesCard;
  payments: CockpitMoneyBlock;
  afterPayments: CockpitMoneyBlock;
  insights: CockpitQuickInsight[];
};

function buildCockpitHero(pulse: TodayBusinessPulse): CockpitHero {
  const attention = pulse.clientCounts.attentionClients;
  const anyDeficit = pulse.projection30dBlocks.some(
    (b) => b.hasConfiguredPayments && b.safeCash30d < 0
  );

  let statusLabel: string;
  let headline: string;

  if (pulse.overallStatus === "critical") {
    statusLabel = "ATENCIÓN CRÍTICA";
    headline =
      anyDeficit || attention > 0
        ? "Hay riesgo operativo por saldos vencidos y cobertura ajustada."
        : pulse.headline;
  } else if (attention === 0 && pulse.overallStatus === "healthy") {
    statusLabel = "SITUACIÓN ESTABLE";
    headline = "No hay clientes con atraso relevante en este período.";
  } else if (attention > 0 || pulse.overallStatus === "attention") {
    statusLabel = "REQUIERE ATENCIÓN";
    headline = pulse.headline;
  } else {
    statusLabel = "SITUACIÓN ESTABLE";
    headline = pulse.headline;
  }

  return {
    status: pulse.overallStatus,
    statusLabel,
    headline,
    metricsLine: pulse.heroSubline,
    operacionalHref: "/copilot/alertas",
  };
}

function amountsFromBlocks(
  getAmount: (currency: "UYU" | "USD") => number
): CockpitCurrencyAmount[] {
  const out: CockpitCurrencyAmount[] = [];
  for (const c of ["UYU", "USD"] as const) {
    const amount = getAmount(c);
    if (amount !== 0) out.push({ currency: c, amount, formatted: fmtCurrencyAmount(amount, c) });
  }
  return out;
}

const ACCENT_RANK: Record<CockpitAfterPaymentsAccent, number> = {
  comfortable: 0,
  adjusted: 1,
  critical: 2,
};

function worseAfterPaymentsAccent(
  current: CockpitAfterPaymentsAccent,
  next: CockpitAfterPaymentsAccent
): CockpitAfterPaymentsAccent {
  return ACCENT_RANK[next] > ACCENT_RANK[current] ? next : current;
}

function accentFromProjection(
  proj: TodayBusinessPulse["projection30dBlocks"][number] | undefined
): CockpitAfterPaymentsAccent {
  if (!proj?.hasConfiguredPayments) {
    return (proj?.currentCash ?? 0) < 0 ? "critical" : "comfortable";
  }
  if (proj.expectedCash30d < 0) return "critical";
  if (proj.safeCash30d < 0) return "adjusted";
  if (proj.safeCoverageStatus === "attention") return "adjusted";
  return "comfortable";
}

function footnoteForAccent(accent: CockpitAfterPaymentsAccent): CockpitFootnote {
  if (accent === "critical") return { tone: "danger", text: "🔴 Riesgo de caja" };
  return { tone: "ok", text: "🟢 Cubierto con cobros previstos" };
}

/** Cobertura 30d — muestra expectedCash30d (caja + por cobrar − pagos); fórmulas sin cambios. */
function buildAfterPaymentsBlock(pulse: TodayBusinessPulse): CockpitMoneyBlock {
  const amounts: CockpitCurrencyAmount[] = [];
  let accent: CockpitAfterPaymentsAccent = "comfortable";

  for (const c of ["UYU", "USD"] as const) {
    const proj = pulse.projection30dBlocks.find((b) => b.currency === c);
    const cur = pulse.currentStateBlocks.find((b) => b.currency === c);
    if (!proj && !cur) continue;

    const amount = proj
      ? proj.hasConfiguredPayments
        ? proj.expectedCash30d
        : proj.currentCash
      : (cur?.cashAvailable ?? 0);
    const show =
      amount !== 0 ||
      (cur?.cashAvailable ?? 0) !== 0 ||
      (proj?.hasConfiguredPayments ?? false);
    if (!show) continue;

    amounts.push({ currency: c, amount, formatted: fmtCurrencyAmount(amount, c) });
    accent = worseAfterPaymentsAccent(accent, accentFromProjection(proj));
  }

  return { amounts, footnote: footnoteForAccent(accent), afterPaymentsAccent: accent };
}

function countUniqueDebtorClients(
  rows: DebtorCollectionRow[],
  predicate: (row: DebtorCollectionRow) => boolean
): number {
  const ids = new Set<string>();
  for (const row of rows) {
    if (predicate(row)) ids.add(row.company_id);
  }
  return ids.size;
}

function buildReceivablesCard(
  pulse: TodayBusinessPulse,
  overdueTotal: CarteraCurrencyTotals,
  overdue30: CarteraCurrencyTotals
): CockpitReceivablesCard {
  const debtorRows = pulse.allDebtorRows;
  const overdueClientCount = countUniqueDebtorClients(debtorRows, (r) => r.flags.hasOverdue);
  const overdue30ClientCount = countUniqueDebtorClients(
    debtorRows,
    (r) => r.flags.hasOverdue && r.flags.critical30Share
  );

  return {
    totalPending: amountsFromBlocks((c) => {
      const block = pulse.currentStateBlocks.find((b) => b.currency === c);
      return block?.pendingReceivables ?? 0;
    }),
    overdueTotal: amountsFromBlocks((c) => overdueTotal[c] ?? 0),
    overdue30: amountsFromBlocks((c) => overdue30[c] ?? 0),
    overdueClientCount: overdueClientCount > 0 ? overdueClientCount : undefined,
    overdue30ClientCount: overdue30ClientCount > 0 ? overdue30ClientCount : undefined,
  };
}

function buildInsights(pulse: TodayBusinessPulse): CockpitQuickInsight[] {
  const insights: CockpitQuickInsight[] = [];
  const configured = pulse.projection30dBlocks.filter((b) => b.hasConfiguredPayments);
  const anyDeficit = configured.some((b) => b.safeCash30d < 0);

  if (configured.length > 0) {
    insights.push({
      id: "cover30",
      tone: anyDeficit ? "warn" : "ok",
      text: anyDeficit ? "Caja ajustada" : "Caja cubierta",
    });
  }

  if (pulse.clientCounts.attentionClients > 0) {
    insights.push({
      id: "attention",
      tone: "warn",
      text: `${pulse.clientCounts.attentionClients} ${pulse.clientCounts.attentionClients === 1 ? "cliente" : "clientes"} con atraso`,
    });
  }

  const configuredPositive =
    configured.length > 0 && configured.every((b) => b.safeCash30d >= 0);
  if (configuredPositive && insights.length < 3) {
    insights.push({
      id: "afterPayments",
      tone: "ok",
      text: "Después de pagos positivo",
    });
  } else if (pulse.overallStatus === "critical") {
    insights.push({
      id: "risk",
      tone: "danger",
      text: "Revisar cobros y pagos programados hoy",
    });
  }

  const periodPositive = pulse.periodActivityBlocks.some((b) => b.operatingResult > 0);
  if (periodPositive && insights.length < 3) {
    insights.push({
      id: "period",
      tone: "ok",
      text: "Liquidez positiva",
    });
  }

  return insights.slice(0, 3);
}

export function buildCockpitView(
  pulse: TodayBusinessPulse,
  overdueTotal: CarteraCurrencyTotals = { UYU: 0, USD: 0 },
  overdue30: CarteraCurrencyTotals = { UYU: 0, USD: 0 }
): CockpitView {
  const moneyAvailable = amountsFromBlocks((c) => {
    const block = pulse.currentStateBlocks.find((b) => b.currency === c);
    return block?.cashAvailable ?? 0;
  });

  const paymentsAmounts = amountsFromBlocks((c) => {
    const block = pulse.projection30dBlocks.find((b) => b.currency === c);
    return block?.hasConfiguredPayments ? (block.futureScheduledPayments ?? block.scheduledPayments) : 0;
  });

  const anyConfigured = pulse.projection30dBlocks.some((b) => b.hasConfiguredPayments);
  const anyDeficit = pulse.projection30dBlocks.some(
    (b) => b.hasConfiguredPayments && b.safeCash30d < 0
  );
  let paymentsFootnote: CockpitFootnote;
  if (!anyConfigured) {
    paymentsFootnote = { tone: "warn", text: "Sin pagos configurados en Tesorería" };
  } else if (anyDeficit) {
    paymentsFootnote = { tone: "warn", text: "Caja ajustada tras pagos" };
  } else {
    paymentsFootnote = { tone: "ok", text: "Cubiertos con caja actual" };
  }

  const hasCash = moneyAvailable.some((a) => a.amount > 0);
  let moneyFootnote: CockpitFootnote = hasCash
    ? { tone: pulse.overallStatus === "critical" ? "warn" : "ok", text: "Caja actual saludable" }
    : { tone: "warn", text: "Sin caja registrada hoy" };
  if (anyDeficit && hasCash) {
    moneyFootnote = { tone: "warn", text: "Caja ajustada tras pagos a fin de mes" };
  }

  return {
    hero: buildCockpitHero(pulse),
    moneyAvailable: { amounts: moneyAvailable, footnote: moneyFootnote },
    receivables: buildReceivablesCard(pulse, overdueTotal, overdue30),
    payments: { amounts: paymentsAmounts, footnote: paymentsFootnote },
    afterPayments: buildAfterPaymentsBlock(pulse),
    insights: buildInsights(pulse),
  };
}

/** Orden para tabla: mayor riesgo primero. */
export function sortDebtorRowsForCockpit<T extends {
  vencido: { amount: number } | null;
  flags: { critical30Share: boolean };
  riesgo: string;
  deuda: { amount: number };
}>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const score = (r: typeof a) => {
      let s = 0;
      if ((r.vencido?.amount ?? 0) > 0) s += 1000 + (r.vencido?.amount ?? 0);
      if (r.flags.critical30Share) s += 500;
      if (r.riesgo === "Alto") s += 200;
      s += r.deuda.amount / 1000;
      return s;
    };
    return score(b) - score(a);
  });
}
