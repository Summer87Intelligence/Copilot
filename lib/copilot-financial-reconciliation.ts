/**
 * Financial consistency report — pure, no DB access, fully testable.
 *
 * Diagnoses:
 *   - Invoices without currency_code (excluded from debt calculations)
 *   - Pending balances by currency (USD / UYU)
 *   - Per-client data staleness (from MAX(invoice.updated_at) GROUP BY company_id)
 *   - Workspace-level sync state freshness
 *   - Period filter (mode: 'all_outstanding' | 'period_only')
 *   - Gap explainability (unaccounted amounts breakdown)
 *   - Observability metrics
 *   - Operational period metadata (2026-01-01 → today)
 *   - Historical exclusion summary (pre-2026 invoices with pending balance)
 *
 * Stale thresholds:
 *   warning  > 24 h since last invoice update
 *   critical > 72 h since last invoice update
 *   never_synced: no invoice updated_at found for client
 */

import {
  COPILOT_OPERATIONAL_START_DATE,
  getCopilotOperationalEndDate,
} from "@/lib/copilot-operational-period";

export const STALE_WARNING_HOURS = 24;
export const STALE_CRITICAL_HOURS = 72;

export type ReconciliationCurrencyCode = "USD" | "UYU";
export type StalenessStatus = "ok" | "warning" | "critical" | "never_synced";
export type ReconciliationMode = "all_outstanding" | "period_only";
export type AgingRange = "0_30" | "31_60" | "61_90" | "90_plus";

export type AgingBucket = {
  range: AgingRange;
  amount: number;
  invoiceCount: number;
  clientCount: number;
  /** Fraction of total pending in this currency [0..1]. */
  percentage: number;
};

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type InvoiceInput = {
  id: string;
  company_id: string | null;
  currency_code: string | null;
  total_amount: number | null;
  balance_amount: number | null;
  status: string | null;
  updated_at: string | null;
  /** ISO date YYYY-MM-DD — required for period_only mode filtering. */
  issue_date?: string | null;
  /** From zeta_metadata.zeta_reconciliation.pending_sync_missing_count */
  reconciliation_missing_count?: number | null;
};

export type SyncStateInput = {
  resource_flow: string;
  last_success_at: string | null;
  bootstrap_completed: boolean;
};

export type CompanyInput = {
  id: string;
  name: string | null;
};

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type CurrencyReconciliation = {
  currencyCode: ReconciliationCurrencyCode;
  totalPending: number;
  totalInvoiced: number;
  /** Total de facturas no anuladas que aportaron a la moneda. */
  invoiceCount: number;
  /**
   * Subconjunto de `invoiceCount` cuyo saldo pendiente (`balance_amount` o
   * fallback a `total_amount`) es estrictamente mayor a 0. Se calcula sobre
   * las mismas reglas que `totalPending`, sin recalcular en frontend.
   */
  pendingInvoiceCount: number;
};

export type ClientStaleness = {
  companyId: string;
  companyName: string | null;
  lastInvoiceUpdatedAt: string | null;
  ageHours: number | null;
  status: StalenessStatus;
  invoiceCount: number;
  /**
   * Saldo pendiente del cliente desagregado por moneda (mismo cálculo que se usa
   * para `gaps.stalePendingByCurrency`). Permite a la UI de Cartera priorizar
   * por exposición real sin recalcular en frontend. Solo lectura.
   */
  pendingByCurrency: Partial<Record<ReconciliationCurrencyCode, number>>;
  dominantAgingRange: AgingRange | null;
};

export type SyncStateSummary = {
  resource_flow: string;
  last_success_at: string | null;
  bootstrap_completed: boolean;
  ageHours: number | null;
  status: StalenessStatus;
};

export type StaleSummary = {
  ok: number;
  warning: number;
  critical: number;
  never_synced: number;
};

/** Breakdown of why some amounts are unaccounted in the totals. */
export type ReconciliationGaps = {
  /** Invoices excluded because currency_code is null or unrecognized. */
  invoicesWithoutCurrency: number;
  /** Invoices excluded because issue_date is outside the period filter (only when mode=period_only). */
  invoicesExcludedByPeriodFilter: number;
  /** Clients whose data may be stale (warning, critical, or never_synced). */
  clientsWithStaleData: number;
  /** Pending balance sums for stale clients by currency (estimated missing/suspect amount). */
  stalePendingByCurrency: Partial<Record<ReconciliationCurrencyCode, number>>;
  /** Non-voided invoices (after period filter) with issue_date < 2026-01-01. */
  pre2026InvoiceCount: number;
};

/** Orphan pending invoice summary derived from reconciliation_missing_count on invoices. */
export type OrphanSummary = {
  /** Invoices with missing_count >= 1 (warned at least once). */
  warned: number;
  /** Invoices with missing_count >= 3 that should be auto-closed next cleanup run. */
  pending_auto_close: number;
  /** Total pending balance in warned invoices by currency. */
  warnedPendingByCurrency: Partial<Record<ReconciliationCurrencyCode, number>>;
};

/** Período operativo del reporte: siempre 2026-01-01 → hoy. */
export type OperationalPeriod = {
  /** COPILOT_OPERATIONAL_START_DATE */
  start: string;
  /** Fecha ISO del día en que se generó el reporte (YYYY-MM-DD). */
  end: string;
};

/** Resumen de facturas históricas (pre-operacionales) con saldo pendiente. */
export type ExcludedHistoricalSummary = {
  /** No. de facturas no anuladas con issue_date < COPILOT_OPERATIONAL_START_DATE y saldo pendiente > 0. */
  invoiceCount: number;
  /** Suma de saldos pendientes de esas facturas, por moneda. */
  pendingByCurrency: Partial<Record<ReconciliationCurrencyCode, number>>;
};

/** Observability metrics derived from the report. */
export type ReconciliationMetrics = {
  /** Stale clients (warning + critical + never_synced) / total clients. null if no clients. */
  stale_ratio: number | null;
  /** Invoices without currency / total invoices (non-voided). null if no invoices. */
  unknown_currency_ratio: number | null;
  /** Invoices excluded by period filter / total invoices loaded (before period filter). null if mode=all_outstanding. */
  period_exclusion_ratio: number | null;
};

export type FinancialConsistencyReport = {
  generatedAt: string;
  workspaceId: string;
  mode: ReconciliationMode;
  periodStart: string | null;
  periodEnd: string | null;
  /** Active currencies with at least one invoice. Order: USD → UYU. */
  currencies: CurrencyReconciliation[];
  /** Total non-voided invoices processed (after period filter if applicable). */
  totalInvoices: number;
  /** Non-voided invoices skipped because currency_code was null or unrecognized. */
  totalInvoicesWithoutCurrency: number;
  /** Voided/cancelled invoices (excluded from all totals). */
  voidedInvoices: number;
  /** Workspace-level sync state per resource_flow. */
  syncStates: SyncStateSummary[];
  /** Per-client staleness, sorted worst-first. */
  staleClients: ClientStaleness[];
  /** Aggregate count by staleness status. */
  staleSummary: StaleSummary;
  /** Breakdown of amounts not captured in currency totals. */
  gaps: ReconciliationGaps;
  /** Derived observability ratios. */
  metrics: ReconciliationMetrics;
  /** Aging buckets for pending invoices by currency (server-computed, render-only in frontend). */
  agingByCurrency: Partial<Record<ReconciliationCurrencyCode, AgingBucket[]>>;
  /** Orphan pending invoices detected by reconciliation runs. */
  orphanSummary: OrphanSummary;
  /** Período operativo de referencia: 2026-01-01 → hoy. */
  operationalPeriod: OperationalPeriod;
  /** Facturas históricas (pre-operacionales) con saldo pendiente, excluidas del período operativo. */
  excludedHistorical: ExcludedHistoricalSummary;
};

export type GenerateFinancialConsistencyReportInput = {
  workspaceId: string;
  invoices: InvoiceInput[];
  companies: CompanyInput[];
  syncStates: SyncStateInput[];
  /** ISO datetime — injectable for deterministic tests. Defaults to now. */
  now?: string;
  /**
   * 'all_outstanding' (default): include all non-voided invoices regardless of issue_date.
   * 'period_only': only include invoices where issue_date is within [periodStart, periodEnd].
   */
  mode?: ReconciliationMode;
  /** YYYY-MM-DD inclusive lower bound. Required when mode='period_only'. */
  periodStart?: string;
  /** YYYY-MM-DD inclusive upper bound. Required when mode='period_only'. */
  periodEnd?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VOIDED_STATUSES = new Set([
  "void",
  "voided",
  "canceled",
  "cancelled",
  "anulada",
  "anulado",
  "annulled",
  "annul",
]);

const VALID_CURRENCIES: ReadonlySet<string> = new Set(["USD", "UYU"]);

function isVoided(status: string | null): boolean {
  if (!status) return false;
  return VOIDED_STATUSES.has(status.trim().toLowerCase());
}

function safeNum(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return v;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function hoursElapsed(isoStr: string | null, nowMs: number): number | null {
  if (!isoStr) return null;
  const ms = Date.parse(isoStr);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, (nowMs - ms) / (1000 * 60 * 60));
}

function stalenessFromHours(hours: number | null): StalenessStatus {
  if (hours === null) return "never_synced";
  if (hours > STALE_CRITICAL_HOURS) return "critical";
  if (hours > STALE_WARNING_HOURS) return "warning";
  return "ok";
}

const STALENESS_ORDER: Record<StalenessStatus, number> = {
  never_synced: 0,
  critical: 1,
  warning: 2,
  ok: 3,
};

function isWithinPeriod(
  issueDate: string | null | undefined,
  periodStart: string,
  periodEnd: string
): boolean {
  const d = (issueDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return d >= periodStart && d <= periodEnd;
}

const AGING_RANGES: AgingRange[] = ["0_30", "31_60", "61_90", "90_plus"];

function computeAgingRange(
  issueDateStr: string | null | undefined,
  nowMs: number
): AgingRange | null {
  const d = (issueDateStr ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const ms = Date.parse(d);
  if (!Number.isFinite(ms)) return null;
  const days = Math.max(0, Math.floor((nowMs - ms) / (1000 * 60 * 60 * 24)));
  if (days <= 30) return "0_30";
  if (days <= 60) return "31_60";
  if (days <= 90) return "61_90";
  return "90_plus";
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

export function generateFinancialConsistencyReport(
  input: GenerateFinancialConsistencyReportInput
): FinancialConsistencyReport {
  const nowMs = input.now ? Date.parse(input.now) : Date.now();
  const generatedAt = input.now ?? new Date().toISOString();
  const mode: ReconciliationMode = input.mode ?? "all_outstanding";
  const periodStart = input.periodStart ?? null;
  const periodEnd = input.periodEnd ?? null;
  const usePeriodFilter =
    mode === "period_only" && periodStart !== null && periodEnd !== null;

  // Operational period metadata
  const operationalStart = COPILOT_OPERATIONAL_START_DATE;
  const operationalEnd = generatedAt.slice(0, 10); // YYYY-MM-DD from ISO

  // --- Pre-pass: compute excludedHistorical (before period filter, over all non-voided invoices) ---
  const excludedHistoricalAccum: Partial<Record<ReconciliationCurrencyCode, number>> = {};
  let excludedHistoricalCount = 0;
  for (const inv of input.invoices) {
    if (isVoided(inv.status)) continue;
    const issueSl = (inv.issue_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issueSl) || issueSl >= operationalStart) continue;
    const code = (inv.currency_code ?? "").trim().toUpperCase() as ReconciliationCurrencyCode;
    if (!VALID_CURRENCIES.has(code)) continue;
    const totalAmount = round2(Math.max(0, safeNum(inv.total_amount)));
    if (!(totalAmount > 0)) continue;
    const rawBalance = inv.balance_amount;
    const pendingAmount =
      rawBalance == null
        ? totalAmount
        : round2(Math.max(0, safeNum(rawBalance)));
    if (!(pendingAmount > 0)) continue;
    excludedHistoricalCount++;
    excludedHistoricalAccum[code] = round2(
      (excludedHistoricalAccum[code] ?? 0) + pendingAmount
    );
  }

  // Name lookup
  const companyNameById = new Map<string, string | null>();
  for (const c of input.companies) {
    if (c.id) companyNameById.set(c.id, c.name ?? null);
  }

  // --- Invoice pass ---
  type Bucket = {
    totalPending: number;
    totalInvoiced: number;
    invoiceCount: number;
    pendingInvoiceCount: number;
  };
  const buckets: Partial<Record<string, Bucket>> = {};

  let totalInvoices = 0;
  let totalWithoutCurrency = 0;
  let voidedInvoices = 0;
  let invoicesExcludedByPeriodFilter = 0;

  // Per-client: latest invoice updated_at (ms)
  const clientLatestMs = new Map<string, number>();
  const clientInvoiceCount = new Map<string, number>();

  // Per-client pending by currency (for stale gap estimation)
  const clientPendingByCurrency = new Map<
    string,
    Partial<Record<ReconciliationCurrencyCode, number>>
  >();

  // Aging accumulation: per-currency per-range (pending invoices only)
  type AgingBucketAccum = { amount: number; invoiceCount: number; clients: Set<string> };
  type AgingCurrAccum = Record<AgingRange, AgingBucketAccum>;
  const agingAccum = new Map<ReconciliationCurrencyCode, AgingCurrAccum>();
  function getOrCreateAgingAccum(code: ReconciliationCurrencyCode): AgingCurrAccum {
    let cur = agingAccum.get(code);
    if (!cur) {
      cur = {
        "0_30":    { amount: 0, invoiceCount: 0, clients: new Set() },
        "31_60":   { amount: 0, invoiceCount: 0, clients: new Set() },
        "61_90":   { amount: 0, invoiceCount: 0, clients: new Set() },
        "90_plus": { amount: 0, invoiceCount: 0, clients: new Set() },
      };
      agingAccum.set(code, cur);
    }
    return cur;
  }

  // Per-client aging amounts: companyId → range → pending sum
  const clientAgingAmounts = new Map<string, Record<AgingRange, number>>();

  let pre2026Count = 0;

  for (const inv of input.invoices) {
    if (isVoided(inv.status)) {
      voidedInvoices++;
      continue;
    }

    // Period filter
    if (usePeriodFilter) {
      if (!isWithinPeriod(inv.issue_date, periodStart!, periodEnd!)) {
        invoicesExcludedByPeriodFilter++;
        continue;
      }
    }

    totalInvoices++;

    // Pre-2026 tracking (non-voided invoices with issue_date before 2026)
    {
      const issueSl = (inv.issue_date ?? "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(issueSl) && issueSl < "2026-01-01") pre2026Count++;
    }

    // Per-client updated_at tracking
    const companyId = inv.company_id?.trim() ?? "";
    if (companyId) {
      if (inv.updated_at) {
        const ms = Date.parse(inv.updated_at);
        if (Number.isFinite(ms)) {
          const prev = clientLatestMs.get(companyId) ?? 0;
          if (ms > prev) clientLatestMs.set(companyId, ms);
        }
      }
      clientInvoiceCount.set(companyId, (clientInvoiceCount.get(companyId) ?? 0) + 1);
    }

    // Currency accumulation
    const code = (inv.currency_code ?? "").trim().toUpperCase();
    if (!code || !VALID_CURRENCIES.has(code)) {
      totalWithoutCurrency++;
      continue;
    }

    const totalAmount = round2(Math.max(0, safeNum(inv.total_amount)));
    if (!(totalAmount > 0)) continue;

    const rawBalance = inv.balance_amount;
    const pendingAmount =
      rawBalance == null
        ? totalAmount
        : round2(Math.max(0, safeNum(rawBalance)));

    const b = buckets[code] ?? {
      totalPending: 0,
      totalInvoiced: 0,
      invoiceCount: 0,
      pendingInvoiceCount: 0,
    };
    b.totalInvoiced = round2(b.totalInvoiced + totalAmount);
    b.totalPending = round2(b.totalPending + pendingAmount);
    b.invoiceCount++;
    if (pendingAmount > 0) b.pendingInvoiceCount++;
    buckets[code] = b;

    // Track per-client pending for gap analysis
    if (companyId) {
      const cur = clientPendingByCurrency.get(companyId) ?? {};
      const cc = code as ReconciliationCurrencyCode;
      cur[cc] = round2((cur[cc] ?? 0) + pendingAmount);
      clientPendingByCurrency.set(companyId, cur);
    }

    // Aging accumulation (only pending invoices with parseable issue_date)
    if (pendingAmount > 0) {
      const agRange = computeAgingRange(inv.issue_date, nowMs);
      if (agRange !== null) {
        const accum = getOrCreateAgingAccum(code as ReconciliationCurrencyCode);
        const bk = accum[agRange];
        bk.amount = round2(bk.amount + pendingAmount);
        bk.invoiceCount++;
        if (companyId) bk.clients.add(companyId);

        if (companyId) {
          let cliAg = clientAgingAmounts.get(companyId);
          if (!cliAg) {
            cliAg = { "0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 };
            clientAgingAmounts.set(companyId, cliAg);
          }
          cliAg[agRange] = round2(cliAg[agRange] + pendingAmount);
        }
      }
    }
  }

  const currencyOrder: ReconciliationCurrencyCode[] = ["USD", "UYU"];

  // --- Aging by currency ---
  const agingByCurrency: Partial<Record<ReconciliationCurrencyCode, AgingBucket[]>> = {};
  for (const code of currencyOrder) {
    const accum = agingAccum.get(code);
    if (!accum) continue;
    const totalAging = AGING_RANGES.reduce((s, r) => s + accum[r].amount, 0);
    agingByCurrency[code] = AGING_RANGES.map((range) => {
      const b = accum[range];
      return {
        range,
        amount: b.amount,
        invoiceCount: b.invoiceCount,
        clientCount: b.clients.size,
        percentage: totalAging > 0 ? round2(b.amount / totalAging) : 0,
      };
    });
  }

  const currencies: CurrencyReconciliation[] = currencyOrder
    .filter((code) => (buckets[code]?.invoiceCount ?? 0) > 0)
    .map((code) => ({
      currencyCode: code,
      totalPending: buckets[code]!.totalPending,
      totalInvoiced: buckets[code]!.totalInvoiced,
      invoiceCount: buckets[code]!.invoiceCount,
      pendingInvoiceCount: buckets[code]!.pendingInvoiceCount,
    }));

  // --- Sync states ---
  const syncStates: SyncStateSummary[] = input.syncStates.map((s) => {
    const hours = hoursElapsed(s.last_success_at, nowMs);
    return {
      resource_flow: s.resource_flow,
      last_success_at: s.last_success_at,
      bootstrap_completed: s.bootstrap_completed,
      ageHours: hours !== null ? round2(hours) : null,
      status: stalenessFromHours(hours),
    };
  });

  // --- Per-client staleness ---
  const staleSummary: StaleSummary = { ok: 0, warning: 0, critical: 0, never_synced: 0 };
  const staleClients: ClientStaleness[] = [];

  for (const [companyId, invoiceCount] of clientInvoiceCount) {
    const lastMs = clientLatestMs.get(companyId) ?? null;
    const hours =
      lastMs !== null ? Math.max(0, (nowMs - lastMs) / (1000 * 60 * 60)) : null;
    const status = stalenessFromHours(hours);
    staleSummary[status]++;
    // Derive dominantAgingRange from per-client aging accumulation
    const cliAg = clientAgingAmounts.get(companyId);
    let dominantAgingRange: AgingRange | null = null;
    if (cliAg) {
      let maxAmt = -1;
      for (const r of AGING_RANGES) {
        if (cliAg[r] > maxAmt) { maxAmt = cliAg[r]; dominantAgingRange = r; }
      }
      if (maxAmt <= 0) dominantAgingRange = null;
    }

    staleClients.push({
      companyId,
      companyName: companyNameById.get(companyId) ?? null,
      lastInvoiceUpdatedAt: lastMs !== null ? new Date(lastMs).toISOString() : null,
      ageHours: hours !== null ? round2(hours) : null,
      status,
      invoiceCount,
      pendingByCurrency: { ...(clientPendingByCurrency.get(companyId) ?? {}) },
      dominantAgingRange,
    });
  }

  staleClients.sort((a, b) => {
    const diff = STALENESS_ORDER[a.status] - STALENESS_ORDER[b.status];
    if (diff !== 0) return diff;
    return (b.ageHours ?? 0) - (a.ageHours ?? 0);
  });

  // --- Gaps ---
  const staleClientIds = staleClients
    .filter((c) => c.status !== "ok")
    .map((c) => c.companyId);

  const stalePendingByCurrency: Partial<Record<ReconciliationCurrencyCode, number>> = {};
  for (const cid of staleClientIds) {
    const byC = clientPendingByCurrency.get(cid);
    if (!byC) continue;
    for (const cc of currencyOrder) {
      if (byC[cc]) {
        stalePendingByCurrency[cc] = round2(
          (stalePendingByCurrency[cc] ?? 0) + byC[cc]!
        );
      }
    }
  }

  const gaps: ReconciliationGaps = {
    invoicesWithoutCurrency: totalWithoutCurrency,
    invoicesExcludedByPeriodFilter,
    clientsWithStaleData: staleClientIds.length,
    stalePendingByCurrency,
    pre2026InvoiceCount: pre2026Count,
  };

  // --- Metrics ---
  const totalClients = staleClients.length;
  const staleCount =
    staleSummary.warning + staleSummary.critical + staleSummary.never_synced;

  const totalInvoicesLoaded = totalInvoices + invoicesExcludedByPeriodFilter + totalWithoutCurrency;

  const metrics: ReconciliationMetrics = {
    stale_ratio: totalClients > 0 ? round2(staleCount / totalClients) : null,
    unknown_currency_ratio:
      totalInvoices > 0
        ? round2(totalWithoutCurrency / totalInvoices)
        : null,
    period_exclusion_ratio:
      mode === "period_only" && totalInvoicesLoaded > 0
        ? round2(invoicesExcludedByPeriodFilter / totalInvoicesLoaded)
        : null,
  };

  // --- Orphan summary ---
  const orphanSummary: OrphanSummary = {
    warned: 0,
    pending_auto_close: 0,
    warnedPendingByCurrency: {},
  };
  for (const inv of input.invoices) {
    const mc = inv.reconciliation_missing_count;
    if (mc == null || mc <= 0) continue;
    const status = (inv.status ?? "").trim().toLowerCase();
    const voided = VOIDED_STATUSES.has(status);
    if (voided) continue;
    orphanSummary.warned++;
    if (mc >= 3) orphanSummary.pending_auto_close++;
    const code = (inv.currency_code ?? "").trim().toUpperCase() as ReconciliationCurrencyCode;
    if (VALID_CURRENCIES.has(code)) {
      const pending = inv.balance_amount != null ? Math.max(0, safeNum(inv.balance_amount)) : safeNum(inv.total_amount);
      orphanSummary.warnedPendingByCurrency[code] = round2(
        (orphanSummary.warnedPendingByCurrency[code] ?? 0) + pending
      );
    }
  }

  return {
    generatedAt,
    workspaceId: input.workspaceId,
    mode,
    periodStart,
    periodEnd,
    currencies,
    totalInvoices,
    totalInvoicesWithoutCurrency: totalWithoutCurrency,
    voidedInvoices,
    syncStates,
    staleClients,
    staleSummary,
    gaps,
    metrics,
    agingByCurrency,
    orphanSummary,
    operationalPeriod: {
      start: operationalStart,
      end: operationalEnd,
    },
    excludedHistorical: {
      invoiceCount: excludedHistoricalCount,
      pendingByCurrency: excludedHistoricalAccum,
    },
  };
}
