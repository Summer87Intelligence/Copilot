/**
 * Dashboard Resumen — pure data transformation functions.
 *
 * NO I/O, NO Supabase, NO API calls.
 * All input comes from existing API responses; output feeds the dashboard UI.
 *
 * Metric sources (per canonical contract lib/copilot-financial-metrics-contract.ts):
 *  - facturado_periodo   → CurrencyReconciliation.issuedInPeriod − creditNoteAmount
 *  - cobrado_periodo     → CurrencyReconciliation.collectedInPeriod (real receipts)
 *  - deuda_activa        → outstanding CurrencyReconciliation.pendingAtCutoff
 *  - deuda_vencida       → aging buckets 31_60 + 61_90 + 90_plus (due_date based)
 *  - caja_disponible     → CashPositionByCurrency.availableCash
 *  - caja_despues_pagos  → availableCash − TreasuryOutflowSummary.next30Days
 */

import type {
  AgingBucket,
  AgingRange,
  CurrencyReconciliation,
  FinancialConsistencyReport,
  ReconciliationCurrencyCode,
} from "./copilot-financial-reconciliation";
import type { ClientPortfolioRow } from "./copilot-clients-portfolio";
import type { CashPositionByCurrency } from "./treasury/treasury-cash-position";
import type { TreasuryOutflowSummary } from "./treasury/treasury-scheduled-payments";

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type DashboardCurrencyData = {
  currency: "UYU" | "USD";
  facturado: number;
  cobrado: number;
  efectividad: number | null; // [0..1]
  deudaActiva: number;
  deudaVencida: number;
  aging: { label: string; amount: number; range: AgingRange }[];
  cajaDisponible: number;
  cajaDespPagos: number;
};

export type DashboardTopDebtor = {
  companyId: string;
  name: string;
  debtUYU: number;
  debtUSD: number;
  overdueUYU: number;
  overdueUSD: number;
  overdueDaysUYU: number | null;
  overdueDaysUSD: number | null;
  risk: string;
};

export type DashboardTopBilling = {
  companyId: string;
  name: string;
  billingUYU: number;
  billingUSD: number;
};

export type DashboardClientStates = {
  sinDeuda: number;
  conDeudaAlDia: number;
  conDeudaVencida: number;
  riesgoAlto: number;
  total: number;
};

export type DashboardMonthlyPoint = {
  monthLabel: string;
  yearMonth: string; // "YYYY-MM"
  issuedUYU: number;
  issuedUSD: number;
  collectedUYU: number;
  collectedUSD: number;
};

export type DashboardState = "ok" | "attention" | "critical";

export type DashboardRecentMovement = {
  date: string;
  type: "factura" | "recibo";
  clientName: string;
  companyId: string;
  reference: string;
  currency: string;
  amount: number;
  balance: number;
};

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const AGING_LABELS: Record<AgingRange, string> = {
  "0_30": "0-30",
  "31_60": "31-60",
  "61_90": "61-90",
  "90_plus": "90+",
};

const OVERDUE_RANGES: AgingRange[] = ["31_60", "61_90", "90_plus"];

const MONTH_LABELS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Exported transforms
// ---------------------------------------------------------------------------

/**
 * Main KPI extraction for the dashboard.
 * Combines period reconciliation, all-outstanding reconciliation, treasury.
 */
export function extractDashboardCurrencyData({
  periodReport,
  outstandingReport,
  cashPositions,
  outflowSummaries,
}: {
  periodReport: FinancialConsistencyReport | null;
  outstandingReport: FinancialConsistencyReport | null;
  cashPositions: CashPositionByCurrency[];
  outflowSummaries: TreasuryOutflowSummary[];
}): DashboardCurrencyData[] {
  const codes: ReconciliationCurrencyCode[] = ["UYU", "USD"];
  return codes
    .map((cur): DashboardCurrencyData => {
      const period: CurrencyReconciliation | undefined =
        periodReport?.currencies?.find((c) => c.currencyCode === cur);
      const outstanding: CurrencyReconciliation | undefined =
        outstandingReport?.currencies?.find((c) => c.currencyCode === cur);

      const agingBuckets: AgingBucket[] =
        (outstandingReport?.agingByCurrency?.[cur as keyof typeof outstandingReport.agingByCurrency] as
          | AgingBucket[]
          | undefined) ?? [];

      const cash = cashPositions.find((c) => c.currency === cur);
      const outflow = outflowSummaries.find((o) => o.currency === cur);

      // facturado_periodo = issuedInPeriod − creditNoteAmount (neto de NCs)
      const issued = period?.issuedInPeriod ?? 0;
      const creditNotes = period?.creditNoteAmount ?? 0;
      const facturado = r2(Math.max(0, issued - creditNotes));

      // cobrado_periodo = collectedInPeriod (real receipts — canonical)
      const cobrado = r2(period?.collectedInPeriod ?? 0);

      // efectividad = cobrado / facturado, capped at 1.0
      const efectividad =
        facturado > 0 ? Math.min(1, r2(cobrado / facturado)) : null;

      // deuda_activa = all-outstanding pendingAtCutoff
      const deudaActiva = r2(outstanding?.pendingAtCutoff ?? 0);

      // deuda_vencida = aging 31+ (uses due_date)
      const deudaVencida = r2(
        agingBuckets
          .filter((b) => OVERDUE_RANGES.includes(b.range as AgingRange))
          .reduce((s, b) => s + b.amount, 0)
      );

      const cajaDisponible = r2(cash?.availableCash ?? 0);
      const cajaDespPagos = outflow
        ? r2(cajaDisponible - outflow.next30Days)
        : cajaDisponible;

      return {
        currency: cur,
        facturado,
        cobrado,
        efectividad,
        deudaActiva,
        deudaVencida,
        aging: agingBuckets.map((b) => ({
          label: AGING_LABELS[b.range as AgingRange] ?? b.range,
          amount: b.amount,
          range: b.range as AgingRange,
        })),
        cajaDisponible,
        cajaDespPagos,
      };
    })
    .filter(
      (d) => d.facturado > 0 || d.deudaActiva > 0 || d.cajaDisponible !== 0
    );
}

export function extractTopDebtors(
  rows: ClientPortfolioRow[],
  limit = 10
): DashboardTopDebtor[] {
  return rows
    .filter((r) => r.debt_uyu > 0 || r.debt_usd > 0)
    .sort((a, b) => b.debt_uyu + b.debt_usd - (a.debt_uyu + a.debt_usd))
    .slice(0, limit)
    .map((r) => ({
      companyId: r.company_id,
      name: r.name,
      debtUYU: r.debt_uyu,
      debtUSD: r.debt_usd,
      overdueUYU: r.overdue_uyu ?? 0,
      overdueUSD: r.overdue_usd ?? 0,
      overdueDaysUYU: r.overdue_days_uyu ?? null,
      overdueDaysUSD: r.overdue_days_usd ?? null,
      risk: r.risk,
    }));
}

export function extractTopBilling(
  rows: ClientPortfolioRow[],
  limit = 10
): DashboardTopBilling[] {
  return rows
    .filter((r) => (r.billing_uyu ?? 0) > 0 || (r.billing_usd ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.billing_uyu ?? 0) + (b.billing_usd ?? 0) -
        ((a.billing_uyu ?? 0) + (a.billing_usd ?? 0))
    )
    .slice(0, limit)
    .map((r) => ({
      companyId: r.company_id,
      name: r.name,
      billingUYU: r.billing_uyu ?? 0,
      billingUSD: r.billing_usd ?? 0,
    }));
}

export function extractClientStates(
  rows: ClientPortfolioRow[]
): DashboardClientStates {
  let sinDeuda = 0,
    conDeudaAlDia = 0,
    conDeudaVencida = 0,
    riesgoAlto = 0;
  for (const r of rows) {
    if (r.debt_uyu === 0 && r.debt_usd === 0) {
      sinDeuda++;
    } else if (r.risk === "Alto") {
      riesgoAlto++;
    } else if ((r.overdue_uyu ?? 0) > 0 || (r.overdue_usd ?? 0) > 0) {
      conDeudaVencida++;
    } else {
      conDeudaAlDia++;
    }
  }
  return {
    sinDeuda,
    conDeudaAlDia,
    conDeudaVencida,
    riesgoAlto,
    total: rows.length,
  };
}

export function extractMonthlyPoint(
  report: FinancialConsistencyReport | null,
  yearMonth: string
): DashboardMonthlyPoint {
  const [, monthStr] = yearMonth.split("-");
  const monthIdx = parseInt(monthStr ?? "1", 10) - 1;
  const monthLabel = MONTH_LABELS[monthIdx] ?? yearMonth;
  const uyu = report?.currencies?.find((c) => c.currencyCode === "UYU");
  const usd = report?.currencies?.find((c) => c.currencyCode === "USD");
  return {
    monthLabel,
    yearMonth,
    issuedUYU: uyu?.issuedInPeriod ?? 0,
    issuedUSD: usd?.issuedInPeriod ?? 0,
    collectedUYU: uyu?.collectedInPeriod ?? 0,
    collectedUSD: usd?.collectedInPeriod ?? 0,
  };
}

export function determineDashboardState(
  currencyData: DashboardCurrencyData[],
  clientStates: DashboardClientStates
): DashboardState {
  const totalDeudaVencida = currencyData.reduce(
    (s, d) => s + d.deudaVencida,
    0
  );
  const cajaNegativos = currencyData.filter(
    (d) => d.cajaDisponible > 0 && d.cajaDespPagos < 0
  ).length;

  if (clientStates.riesgoAlto >= 3 || cajaNegativos > 0) return "critical";
  if (
    clientStates.riesgoAlto > 0 ||
    clientStates.conDeudaVencida > 0 ||
    totalDeudaVencida > 0
  )
    return "attention";
  return "ok";
}

/**
 * Build a list of recent movements from portfolio details.
 * Merges invoices + receipts, sorts by date descending, returns latest N.
 */
export function extractRecentMovements(
  details: Record<
    string,
    {
      company_name: string;
      invoices: {
        id: string;
        invoice_number: string;
        issue_date: string;
        total_amount: number;
        balance_amount: number;
        currency_code?: string | null;
      }[];
      receipts: {
        id: string;
        amount: number;
        receipt_date: string;
        currency_code?: string | null;
      }[];
    }
  >,
  periodFrom: string,
  periodTo: string,
  limit = 20
): DashboardRecentMovement[] {
  const movements: DashboardRecentMovement[] = [];

  for (const [companyId, detail] of Object.entries(details)) {
    for (const inv of detail.invoices) {
      if (
        inv.issue_date >= periodFrom &&
        inv.issue_date <= periodTo &&
        inv.total_amount > 0
      ) {
        movements.push({
          date: inv.issue_date,
          type: "factura",
          clientName: detail.company_name,
          companyId,
          reference: inv.invoice_number,
          currency: inv.currency_code ?? "?",
          amount: inv.total_amount,
          balance: inv.balance_amount,
        });
      }
    }
    for (const rec of detail.receipts) {
      if (
        rec.receipt_date >= periodFrom &&
        rec.receipt_date <= periodTo &&
        rec.amount > 0
      ) {
        movements.push({
          date: rec.receipt_date,
          type: "recibo",
          clientName: detail.company_name,
          companyId,
          reference: `REC-${rec.id.slice(0, 8)}`,
          currency: rec.currency_code ?? "?",
          amount: rec.amount,
          balance: 0,
        });
      }
    }
  }

  return movements
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/**
 * Generate last N complete months before today.
 * Returns array of { from, to, yearMonth } in ascending order.
 */
export function getLastNMonthRanges(
  today: string,
  n: number
): { from: string; to: string; yearMonth: string }[] {
  const result: { from: string; to: string; yearMonth: string }[] = [];
  const [year, month] = today.split("-").map(Number);
  for (let i = n; i >= 1; i--) {
    let m = month - i;
    let y = year;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const mm = String(m).padStart(2, "0");
    const lastDay = new Date(y, m, 0).getDate();
    result.push({
      from: `${y}-${mm}-01`,
      to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
      yearMonth: `${y}-${mm}`,
    });
  }
  return result;
}
