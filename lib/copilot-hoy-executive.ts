/**
 * Bloques ejecutivos de /copilot/hoy — puro, sin I/O.
 * UYU y USD siempre separados.
 */

import {
  sumCarteraAgingCurrent,
  sumCarteraAgingOverdue,
  type CarteraCurrencyTotals,
} from "@/lib/copilot-cartera-aging-totals";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import type { SnapshotCurrencyBreakdown } from "@/lib/copilot-snapshot-currency";
import {
  snapshotCashNet,
  snapshotExpectedOutflowsTotal,
  snapshotLiquidityBalance,
} from "@/lib/copilot-financial-snapshot-selectors";
import type { CoverageStatus } from "@/lib/copilot-hoy-treasury";
import type {
  MoneyAmount,
  PulseStatus,
  PriorityCollection,
} from "@/lib/copilot-today-business-pulse";
import { fmtCurrencyAmount, makeMoneyAmount } from "@/lib/copilot-today-business-pulse";
import {
  buildTreasuryBlockExtensionAmounts,
  treasurySummaryForCurrency,
} from "@/lib/copilot-hoy-treasury";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type { TreasuryOutflowSummary } from "@/lib/treasury/treasury-scheduled-payments";

export type CurrencyCode = "UYU" | "USD";

export type CarteraPeriodMetrics = {
  /** Facturado neto del período (`issuedInPeriodNet`). */
  billed: CarteraCurrencyTotals;
  /** Cobrado aplicado del período (`portfolioResolvedAmount` en Cartera). */
  collected: CarteraCurrencyTotals;
  pending: CarteraCurrencyTotals;
};

export type CurrencyExecutiveBlock = {
  currency: CurrencyCode;
  billedPeriod: MoneyAmount | null;
  collectedPeriod: MoneyAmount | null;
  pendingCurrent: MoneyAmount | null;
  overdueCritical30: MoneyAmount | null;
  expectedIncome: MoneyAmount | null;
  expectedIncomeCurrent: MoneyAmount | null;
  expectedIncomeAtRisk: MoneyAmount | null;
  debtorClientsCount: number;
  collectionRate: number | null;
  /** Egresos programados ≤ hoy + 30 días (Tesorería). */
  scheduledOutflows30d: MoneyAmount | null;
  /** Caja actual + por cobrar − egresos programados (30 días). */
  projectedBalance30d: MoneyAmount | null;
  coverageStatus: CoverageStatus;
  hasConfiguredOutflows: boolean;
  status: PulseStatus;
  summary: string;
};

export type DebtorCollectionRow = {
  row_id: string;
  company_id: string;
  name: string;
  currency: CurrencyCode;
  deuda: MoneyAmount;
  vencido: MoneyAmount | null;
  antiguedad: string;
  motivo: string;
  riesgo: "Bajo" | "Medio" | "Alto";
  accion: string;
  deepLink: string;
  /** Alias UI; suele venir de `contact_email` en portfolio. */
  email?: string | null;
  phone?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  /** Días desde el vencimiento de la factura más antigua en mora para esta moneda. */
  overdueDays?: number | null;
  flags: {
    hasOverdue: boolean;
    slowCollection: boolean;
    /** Vencido en esta moneda (proxy para filtro +30 en UI). */
    critical30Share: boolean;
  };
};

export type AttentionClientDetail = {
  company_id: string;
  name: string;
  deuda_uyu: MoneyAmount | null;
  deuda_usd: MoneyAmount | null;
  vencido_uyu: MoneyAmount | null;
  vencido_usd: MoneyAmount | null;
  antiguedad: string;
  motivos: string[];
  accion: string;
  deepLink: string;
};

export type AttentionClientsSummary = {
  /** Clientes con seguimiento prioritario (subset de deudores). */
  total: number;
  /** Todos los clientes con deuda activa (Explorador de deuda / Cartera). */
  totalActiveDebtors: number;
  deudaTotalUyu: number;
  deudaTotalUsd: number;
  vencidoTotalUyu: number;
  vencidoTotalUsd: number;
  clients: AttentionClientDetail[];
};

export type FinancialSituationMetric = {
  label: string;
  value: string;
  helper: string;
  trend: "up" | "down" | "neutral";
};

export type FinancialSituationBlock = {
  currency: CurrencyCode;
  metrics: FinancialSituationMetric[];
};

export const HOY_PRIORITY_TABLE_TOP = 8;

function moneyOrNull(amount: number, currency: CurrencyCode): MoneyAmount | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return makeMoneyAmount(amount, currency);
}

function blockStatus(
  pending: number,
  critical30: number,
  debtors: number
): PulseStatus {
  if (critical30 > 0 && pending > 0 && critical30 / pending >= 0.35) return "critical";
  if (critical30 > 0 || debtors >= 3) return "attention";
  if (pending > 0) return "attention";
  return "healthy";
}

function blockSummary(
  currency: CurrencyCode,
  status: PulseStatus,
  pending: number,
  critical30: number,
  debtors: number
): string {
  const sym = currency === "USD" ? "USD" : "pesos";
  if (status === "healthy") return `Sin presión relevante en ${sym}.`;
  if (critical30 > 0 && pending > 0)
    return `${fmtCurrencyAmount(critical30, currency)} con más de 30 días de atraso.`;
  if (debtors > 0) return `${debtors} clientes con deuda activa en ${sym}.`;
  return `Hay saldo pendiente de cobro en ${sym}.`;
}

export function buildCurrencyExecutiveBlocks(p: {
  period: CarteraPeriodMetrics | null;
  portfolioPending: CarteraCurrencyTotals;
  agingCritical30: CarteraCurrencyTotals;
  agingCurrent: CarteraCurrencyTotals;
  debtorCounts: CarteraCurrencyTotals;
  treasurySummaries?: readonly TreasuryOutflowSummary[];
  treasuryCashPositions?: readonly CashPositionByCurrency[];
}): CurrencyExecutiveBlock[] {
  const codes: CurrencyCode[] = ["UYU", "USD"];
  const blocks: CurrencyExecutiveBlock[] = [];

  for (const currency of codes) {
    const pending = p.portfolioPending[currency] ?? 0;
    const critical30 = p.agingCritical30[currency] ?? 0;
    const current30 = p.agingCurrent[currency] ?? 0;
    const debtors = p.debtorCounts[currency] ?? 0;

    const hasActivity =
      pending > 0 ||
      critical30 > 0 ||
      current30 > 0 ||
      debtors > 0 ||
      (p.period?.billed[currency] ?? 0) > 0 ||
      (p.period?.collected[currency] ?? 0) > 0;

    if (!hasActivity) continue;

    const billed = p.period?.billed[currency] ?? 0;
    const collected = p.period?.collected[currency] ?? 0;
    const collectionRate =
      billed > 0 && collected >= 0 ? Math.min(1, Math.round((collected / billed) * 1000) / 1000) : null;

    const status = blockStatus(pending, critical30, debtors);
    const cashPos = p.treasuryCashPositions?.find((c) => c.currency === currency);
    const treasuryAmt = buildTreasuryBlockExtensionAmounts({
      availableCash: cashPos?.availableCash ?? cashPos?.currentCash ?? 0,
      pending,
      summary: p.treasurySummaries
        ? treasurySummaryForCurrency(p.treasurySummaries, currency)
        : null,
    });

    blocks.push({
      currency,
      billedPeriod: p.period ? moneyOrNull(billed, currency) : null,
      collectedPeriod: p.period ? moneyOrNull(collected, currency) : null,
      pendingCurrent: moneyOrNull(pending, currency),
      overdueCritical30: moneyOrNull(critical30, currency),
      expectedIncome: moneyOrNull(pending, currency),
      expectedIncomeCurrent: moneyOrNull(current30, currency),
      expectedIncomeAtRisk: moneyOrNull(critical30, currency),
      debtorClientsCount: debtors,
      collectionRate,
      scheduledOutflows30d:
        treasuryAmt.scheduledOutflows30d != null
          ? makeMoneyAmount(treasuryAmt.scheduledOutflows30d, currency)
          : null,
      projectedBalance30d:
        treasuryAmt.projectedBalance30d != null
          ? makeMoneyAmount(treasuryAmt.projectedBalance30d, currency)
          : null,
      coverageStatus: treasuryAmt.coverageStatus,
      hasConfiguredOutflows: treasuryAmt.hasConfiguredOutflows,
      status,
      summary: blockSummary(currency, status, pending, critical30, debtors),
    });
  }

  return blocks;
}

function inferAntiguedad(row: ClientPortfolioRow): string {
  const overdue =
    (row.overdue_uyu ?? 0) + (row.overdue_usd ?? 0) > 0 || row.overdue_debt > 0;
  if (overdue) return "Tiene deuda vencida";
  if (row.risk === "Alto" || row.payment_behavior === "lento") return "Cobro lento";
  if ((row.debt_uyu ?? 0) + (row.debt_usd ?? 0) > 0) return "Deuda al día";
  return "Sin mora";
}

function debtorAccion(row: ClientPortfolioRow, hasOverdue: boolean): string {
  if (hasOverdue) return "Contactar por deuda vencida";
  if (row.risk === "Alto" || row.payment_behavior === "lento") return "Hacer seguimiento";
  return "Revisar ficha";
}

function sortScore(vencido: number, deuda: number, slow: boolean): number {
  return vencido * 1e9 + deuda * 1e6 + (slow ? 1e3 : 0);
}

export function buildDebtorCollectionRows(
  rows: ClientPortfolioRow[],
  _critical30ByClient?: never
): DebtorCollectionRow[] {
  const out: DebtorCollectionRow[] = [];

  for (const r of rows) {
    const antiguedad = inferAntiguedad(r);
    const slow = r.risk === "Alto" || r.payment_behavior === "lento";

    if ((r.debt_uyu ?? 0) > 0) {
      const vencidoAmt = r.overdue_uyu ?? (r.debt_usd === 0 ? r.overdue_debt : 0);
      const hasOverdue = vencidoAmt > 0;
      out.push({
        row_id: `${r.company_id}_UYU`,
        company_id: r.company_id,
        name: r.name,
        currency: "UYU",
        deuda: makeMoneyAmount(r.debt_uyu ?? 0, "UYU"),
        vencido: hasOverdue ? makeMoneyAmount(vencidoAmt, "UYU") : null,
        antiguedad,
        overdueDays: hasOverdue ? (r.overdue_days_uyu ?? null) : null,
        motivo: debtorRowMotivo(hasOverdue, slow),
        riesgo: r.risk,
        accion: debtorAccion(r, hasOverdue),
        deepLink: `/copilot/clientes/${r.company_id}`,
        email: r.contact_email ?? null,
        phone: r.contact_phone ?? null,
        contact_email: r.contact_email ?? null,
        contact_phone: r.contact_phone ?? null,
        flags: { hasOverdue, slowCollection: slow, critical30Share: hasOverdue },
      });
    }

    if ((r.debt_usd ?? 0) > 0) {
      const vencidoAmt = r.overdue_usd ?? (r.debt_uyu === 0 ? r.overdue_debt : 0);
      const hasOverdue = vencidoAmt > 0;
      out.push({
        row_id: `${r.company_id}_USD`,
        company_id: r.company_id,
        name: r.name,
        currency: "USD",
        deuda: makeMoneyAmount(r.debt_usd ?? 0, "USD"),
        vencido: hasOverdue ? makeMoneyAmount(vencidoAmt, "USD") : null,
        antiguedad,
        overdueDays: hasOverdue ? (r.overdue_days_usd ?? null) : null,
        motivo: debtorRowMotivo(hasOverdue, slow),
        riesgo: r.risk,
        accion: debtorAccion(r, hasOverdue),
        deepLink: `/copilot/clientes/${r.company_id}`,
        email: r.contact_email ?? null,
        phone: r.contact_phone ?? null,
        contact_email: r.contact_email ?? null,
        contact_phone: r.contact_phone ?? null,
        flags: { hasOverdue, slowCollection: slow, critical30Share: hasOverdue },
      });
    }
  }

  return out.sort((a, b) => {
    const va = a.vencido?.amount ?? 0;
    const vb = b.vencido?.amount ?? 0;
    const sa = sortScore(va, a.deuda.amount, a.flags.slowCollection);
    const sb = sortScore(vb, b.deuda.amount, b.flags.slowCollection);
    return sb - sa;
  });
}

export function debtorRowsToPriorityCollections(
  rows: DebtorCollectionRow[],
  limit: number
): PriorityCollection[] {
  const byClient = new Map<string, PriorityCollection>();

  for (const row of rows.slice(0, limit * 2)) {
    let col = byClient.get(row.company_id);
    if (!col) {
      col = {
        company_id: row.company_id,
        name: row.name,
        deuda: 0,
        vencido: 0,
        riesgo: row.riesgo,
        accion: row.accion,
        deepLink: row.deepLink,
        deuda_breakdown: [],
        vencido_breakdown: [],
      };
      byClient.set(row.company_id, col);
    }
    col.deuda += row.deuda.amount;
    col.vencido += row.vencido?.amount ?? 0;
    col.deuda_breakdown.push(row.deuda);
    if (row.vencido) col.vencido_breakdown.push(row.vencido);
    if (row.flags.slowCollection && row.riesgo === "Alto") col.accion = row.accion;
  }

  return [...byClient.values()]
    .sort((a, b) => b.vencido - a.vencido || b.deuda - a.deuda)
    .slice(0, limit);
}

function attentionMotivos(row: ClientPortfolioRow): string[] {
  const motivos: string[] = [];
  if (row.overdue_debt > 0 || (row.overdue_uyu ?? 0) + (row.overdue_usd ?? 0) > 0)
    motivos.push("Deuda vencida");
  if (row.risk === "Alto" || row.payment_behavior === "lento") motivos.push("Cobro lento");
  if (!row.has_contact_data && row.total_debt > 0) motivos.push("Sin contacto");
  if (motivos.length === 0) motivos.push("Seguimiento recomendado");
  return motivos;
}

export function buildAttentionClientsSummary(
  rows: ClientPortfolioRow[],
  gateConfidence: "high" | "medium" | "low",
  totalActiveDebtors: number
): AttentionClientsSummary {
  const attentionRows = rows
    .filter((r) => clientQualifiesForAttention(r, gateConfidence))
    .sort((a, b) => b.overdue_debt - a.overdue_debt || b.total_debt - a.total_debt);

  const clients = attentionRows.map((r) => {
    const motivos = attentionMotivos(r);
    if (gateConfidence !== "high") motivos.push("Datos pendientes de actualización");
    return {
      company_id: r.company_id,
      name: r.name,
      deuda_uyu: (r.debt_uyu ?? 0) > 0 ? makeMoneyAmount(r.debt_uyu!, "UYU") : null,
      deuda_usd: (r.debt_usd ?? 0) > 0 ? makeMoneyAmount(r.debt_usd!, "USD") : null,
      vencido_uyu: (r.overdue_uyu ?? 0) > 0 ? makeMoneyAmount(r.overdue_uyu!, "UYU") : null,
      vencido_usd: (r.overdue_usd ?? 0) > 0 ? makeMoneyAmount(r.overdue_usd!, "USD") : null,
      antiguedad: inferAntiguedad(r),
      motivos,
      accion: debtorAccion(r, r.overdue_debt > 0),
      deepLink: `/copilot/clientes/${r.company_id}`,
    };
  });

  return {
    total: clients.length,
    totalActiveDebtors,
    deudaTotalUyu: attentionRows.reduce((s, r) => s + (r.debt_uyu ?? 0), 0),
    deudaTotalUsd: attentionRows.reduce((s, r) => s + (r.debt_usd ?? 0), 0),
    vencidoTotalUyu: attentionRows.reduce((s, r) => s + (r.overdue_uyu ?? 0), 0),
    vencidoTotalUsd: attentionRows.reduce((s, r) => s + (r.overdue_usd ?? 0), 0),
    clients,
  };
}

export function buildFinancialSituationBlocks(
  snapshot: FinancialSnapshotApiV1 | null,
  period: CarteraPeriodMetrics | null,
  portfolioPending: CarteraCurrencyTotals
): FinancialSituationBlock[] {
  const byCurrency: SnapshotCurrencyBreakdown | undefined = snapshot?.by_currency;
  const codes: CurrencyCode[] = ["UYU", "USD"];
  const blocks: FinancialSituationBlock[] = [];

  for (const currency of codes) {
    const pending = portfolioPending[currency] ?? 0;
    const snap = byCurrency?.[currency];
    const billed = period?.billed[currency] ?? 0;
    const collected = period?.collected[currency] ?? 0;

    if (!snap && pending <= 0 && billed <= 0 && collected <= 0) continue;

    const metrics: FinancialSituationMetric[] = [];

    if (period && collected > 0) {
      metrics.push({
        label: "Cobrado del período",
        value: fmtCurrencyAmount(collected, currency),
        helper: "Según el mismo período operativo que Cartera.",
        trend: "up",
      });
    } else if (snap?.collected !== undefined && snap.collected > 0) {
      metrics.push({
        label: "Cobrado acumulado",
        value: fmtCurrencyAmount(snap.collected, currency),
        helper: "Total cobrado desde el inicio registrado.",
        trend: "up",
      });
    }

    if (period && billed > 0) {
      metrics.push({
        label: "Facturado",
        value: fmtCurrencyAmount(billed, currency),
        helper: "Facturas emitidas en el período.",
        trend: "neutral",
      });
    } else if (snap?.invoiced !== undefined && snap.invoiced > 0) {
      metrics.push({
        label: "Facturado acumulado",
        value: fmtCurrencyAmount(snap.invoiced, currency),
        helper: "Facturas registradas en la moneda.",
        trend: "neutral",
      });
    }

    if (pending > 0) {
      metrics.push({
        label: "Saldo pendiente",
        value: fmtCurrencyAmount(pending, currency),
        helper: "Deuda activa al día de hoy.",
        trend: "neutral",
      });
      metrics.push({
        label: "Ingreso esperado",
        value: fmtCurrencyAmount(pending, currency),
        helper: "Según deuda activa actual cobrable.",
        trend: "up",
      });
    }

    const snapCurrency = snapshot?.meta?.currency;
    if (
      currency === "UYU" &&
      (snapCurrency === "UYU" || snapCurrency === "mixed" || snapCurrency === "unspecified")
    ) {
      const cashNet = snapshot ? snapshotCashNet(snapshot) : 0;
      if (cashNet !== 0 && (snapCurrency === "UYU" || !byCurrency?.USD)) {
        metrics.push({
          label: "Neto acumulado",
          value: fmtCurrencyAmount(cashNet, "UYU"),
          helper: "Cobros menos pagos — histórico.",
          trend: cashNet >= 0 ? "up" : "down",
        });
      }
    }

    if (metrics.length === 0) continue;
    blocks.push({ currency, metrics });
  }

  if (blocks.length === 0 && snapshot) {
    const cashNet = snapshotCashNet(snapshot);
    const outflows = snapshotExpectedOutflowsTotal(snapshot);
    const liquidity = snapshotLiquidityBalance(snapshot);
    const c: CurrencyCode = snapshot.meta?.currency === "USD" ? "USD" : "UYU";
    blocks.push({
      currency: c,
      metrics: [
        {
          label: "Cobrado acumulado",
          value: fmtCurrencyAmount(snapshot.realized?.receipts_gross ?? 0, c),
          helper: "Total cobrado desde el inicio registrado.",
          trend: "up",
        },
        {
          label: "Neto acumulado",
          value: fmtCurrencyAmount(cashNet, c),
          helper: "Cobros menos pagos — histórico.",
          trend: cashNet >= 0 ? "up" : "down",
        },
        {
          label: "Pagos pendientes",
          value: fmtCurrencyAmount(outflows, c),
          helper: "Pagos con fecha posterior a hoy.",
          trend: "neutral",
        },
        {
          label: "Balance proyectado",
          value: fmtCurrencyAmount(liquidity, c),
          helper: "Estimación: cobros esperados menos pagos programados.",
          trend: liquidity >= 0 ? "up" : "down",
        },
      ],
    });
  }

  return blocks;
}

/** Clientes únicos con saldo UYU o USD > 0 (mismo criterio que Explorador de deuda). */
export function countActiveDebtorClients(rows: ClientPortfolioRow[]): number {
  return rows.filter((r) => (r.debt_uyu ?? 0) > 0 || (r.debt_usd ?? 0) > 0).length;
}

export function countDebtorsByCurrency(rows: ClientPortfolioRow[]): CarteraCurrencyTotals {
  let uyu = 0;
  let usd = 0;
  for (const r of rows) {
    if ((r.debt_uyu ?? 0) > 0) uyu += 1;
    if ((r.debt_usd ?? 0) > 0) usd += 1;
  }
  return { UYU: uyu, USD: usd };
}

export function clientQualifiesForAttention(
  row: ClientPortfolioRow,
  gateConfidence: "high" | "medium" | "low"
): boolean {
  const hasDebt = (row.debt_uyu ?? 0) > 0 || (row.debt_usd ?? 0) > 0;
  if (!hasDebt) return false;
  const hasOverdue =
    row.overdue_debt > 0 ||
    (row.overdue_uyu ?? 0) > 0 ||
    (row.overdue_usd ?? 0) > 0;
  const slow = row.risk === "Alto" || row.payment_behavior === "lento";
  const dataAffectsCollection =
    gateConfidence !== "high" && (!row.has_contact_data || row.derived_from_debt);
  return hasOverdue || slow || dataAffectsCollection;
}

function debtorRowMotivo(hasOverdue: boolean, slow: boolean): string {
  if (hasOverdue && slow) return "Deuda vencida · Cobro lento";
  if (hasOverdue) return "Deuda vencida";
  if (slow) return "Cobro lento";
  return "Deuda activa";
}

export function extractAgingTotals(
  agingByCurrency: Parameters<typeof sumCarteraAgingOverdue>[0] | undefined,
  criticalFromInput?: CarteraCurrencyTotals
): { critical: CarteraCurrencyTotals; current: CarteraCurrencyTotals } {
  if (agingByCurrency) {
    return {
      critical: sumCarteraAgingOverdue(agingByCurrency),
      current: sumCarteraAgingCurrent(agingByCurrency),
    };
  }
  return {
    critical: criticalFromInput ?? { UYU: 0, USD: 0 },
    current: { UYU: 0, USD: 0 },
  };
}
