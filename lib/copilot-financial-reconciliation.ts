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
  MIN_FINANCIAL_DATE,
} from "@/lib/copilot-operational-period";
import {
  isActiveOrphanWarning,
  isStaleOrphanMetadata,
} from "@/lib/integrations/zeta/zeta-orphan-auto-repair";
import { stalenessFromHoursForResourceFlow } from "@/lib/integrations/zeta/zeta-sync-staleness";
import type { AgingComparativeDiagnostics } from "@/lib/copilot-installment-aging-delta";
import type { InstallmentAgingObservationDiagnostics } from "@/lib/copilot-installment-aging-observation";

export const STALE_WARNING_HOURS = 24;
export const STALE_CRITICAL_HOURS = 72;

export type ReconciliationCurrencyCode = "USD" | "UYU";
export type StalenessStatus = "ok" | "warning" | "critical" | "never_synced";
export type ReconciliationMode = "all_outstanding" | "period_only";
export type AgingRange = "0_30" | "31_60" | "61_90" | "90_plus";

/**
 * Origen del aging por moneda.
 *  - `real`      → todas las facturas pending tienen `due_date_source = 'zeta_cuotas_v1'`.
 *  - `synthetic` → ninguna factura tiene due real (todas usan `issue_date + 30`).
 *  - `mixed`     → coexisten real y sintético dentro de la misma moneda.
 *  - `none`      → no hay facturas pending en la moneda (bucket vacío).
 */
export type AgingSource = "real" | "synthetic" | "mixed" | "none";

export type AgingBucket = {
  range: AgingRange;
  amount: number;
  invoiceCount: number;
  clientCount: number;
  /** Fraction of total pending in this currency [0..1]. */
  percentage: number;
  /** Cuántas facturas del bucket usaron due_date real (zeta_cuotas_v1). */
  realDueDateCount: number;
  /** Cuántas facturas del bucket usaron sintético (issue_date + 30). */
  syntheticDueDateCount: number;
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
  /**
   * Vencimiento de la factura. Si `due_date_source === 'zeta_cuotas_v1'` el
   * motor lo usa para aging REAL (cuota Zeta `CuotaVencimiento`). En otros
   * casos cae al sintético `issue_date + 30d`.
   */
  due_date?: string | null;
  /** Procedencia de `due_date`: 'zeta_cuotas_v1' (real) o 'synthetic_30d'. */
  due_date_source?: string | null;
  /** From zeta_metadata.zeta_reconciliation.pending_sync_missing_count */
  reconciliation_missing_count?: number | null;
  /**
   * Opt-in: si la fila es una Nota de Crédito (detectada vía `cfe_tipo` DGI en
   * `zeta_metadata.zeta_customer_voucher_v1`). Cuando es `true`, el motor:
   *   - excluye la fila de `issuedInPeriod` (no es venta nueva)
   *   - NO la suma a `pendingAtCutoff` ni aging (las NCs no son deuda abierta)
   *   - cuenta la fila en `creditNoteCount`/`creditNoteAmount` para auditoría
   *     visual, sin netear globalmente saldos vivos. `balance_amount` ya trae
   *     el saldo pendiente desde Zeta; netear NCs acá duplica descuentos y
   *     puede llevar una moneda a 0 aunque existan facturas abiertas.
   *   - las NCs pre-período siguen reduciendo `openingBalance` ledger, porque
   *     ese campo se reconstruye con `total_amount` histórico, no con saldos.
   *
   * Default `false` para mantener compat total: si el caller no resuelve el
   * flag desde metadata, el motor se comporta como antes. Ver helper
   * `lib/copilot-zeta-credit-note.ts` (`isCreditNoteFromMetadata`).
   */
  is_credit_note?: boolean;
  /** Desde zeta_metadata (solo lectura para búsqueda / display). */
  zeta_client_name?: string | null;
};

/**
 * Recibo de cobranza sincronizado desde Zeta (`proto_receipts`). Es la única
 * fuente confiable para "Cobrado en período": el motor NO deriva cobranza
 * desde `invoiced − pending` porque eso mezcla saldo anterior con cobros del
 * período cuando hay deuda previa al `Desde`.
 */
export type ReceiptInput = {
  id: string;
  company_id: string | null;
  currency_code: string | null;
  amount: number | null;
  /** ISO date YYYY-MM-DD del recibo. Usado para clasificar in-period vs pre-period. */
  receipt_date: string | null;
  /** "paid" | "void" | etc. Recibos anulados se excluyen. */
  status?: string | null;
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
  /**
   * @deprecated Usar `issuedInPeriod`. Alias mantenido para compatibilidad
   * con cards y consumidores existentes. Mismo valor numérico.
   */
  totalInvoiced: number;
  /**
   * Ventas emitidas DENTRO del período `[periodStart, periodEnd]` (suma de
   * `total_amount` de facturas no anuladas con `issue_date` en rango).
   * Equivale a "Ventas Detalladas" de Zeta para el período. Incluye cobradas,
   * parciales y pendientes. No mezcla saldo anterior.
   */
  issuedInPeriod: number;
  /**
   * @deprecated Usar `pendingAtCutoff`. Alias mantenido para compatibilidad
   * con cards/aging existentes.
   */
  totalPending: number;
  /**
   * Saldo pendiente AL CORTE (= `periodEnd`). Suma de `balance_amount > 0` de
   * facturas con `issue_date <= periodEnd` (incluye facturas anteriores al
   * `Desde` que aún tengan saldo). Equivale a "Comprobantes Pendientes" de
   * Zeta filtrado por fecha de corte. NO confundir con "Emitido del período":
   * pendingAtCutoff puede ser mayor que issuedInPeriod cuando hay saldo
   * anterior.
   *
   * Limitación conocida: `balance_amount` se sincroniza por cron cada 3 h y
   * refleja el ESTADO ACTUAL, no el cierre exacto del `periodEnd` si éste
   * es anterior a hoy. Ver `docs/vendors/z/KNOWN-DIVERGENCES.md` DIV-004.
   */
  pendingAtCutoff: number;
  /**
   * Saldo pendiente arrastrado de períodos anteriores: suma de `balance_amount > 0`
   * de facturas con `issue_date < periodStart`. Complemento de `pendingAtCutoff`:
   * `pendingAtCutoff ≈ totalPending (período) + previousPending (anterior)`.
   * Cero en modo `all_outstanding` (sin filtro de período activo).
   */
  previousPending: number;
  /**
   * @deprecated Usar `collectedInPeriod`. Alias mantenido por compatibilidad.
   * El motor lo pre-calcula desde recibos reales (no desde `invoiced - pending`).
   */
  totalCollected: number;
  /**
   * Cobranza DENTRO del período: suma de `proto_receipts.amount` con
   * `receipt_date` en `[periodStart, periodEnd]`, no anulados, por moneda.
   * Fuente única para "Cobrado del período". Nunca se deriva de
   * `issued − pending` porque esa fórmula mezcla cobranza de saldo anterior.
   */
  collectedInPeriod: number;
  /** Cantidad de recibos que aportaron a `collectedInPeriod`. */
  collectedReceiptCount: number;
  /**
   * Saldo anterior al `periodStart` (ledger pre-período): suma de facturas
   * con `issue_date < periodStart` y `total_amount > 0` MENOS recibos con
   * `receipt_date < periodStart` para la misma moneda. Cero si no hay
   * deuda previa o no se aplica filtro de período. Documentación
   * detallada en `docs/vendors/z/KNOWN-DIVERGENCES.md`.
   *
   * Nota: NO contabiliza notas de crédito por falta de regla certificada
   * (ver DIV-003). Para clientes con NCs, este valor puede sobreestimar.
   */
  openingBalance: number;
  /** Total de facturas no anuladas que aportaron a `issuedInPeriod`. */
  invoiceCount: number;
  /**
   * Cantidad de Notas de Crédito detectadas (filas con `is_credit_note=true`).
   * No se netean contra `pendingAtCutoff`; quedan como dato de auditoría para
   * explicar diferencias contables cuando el usuario compare contra reportes
   * que sí apliquen créditos por cuenta corriente.
   */
  creditNoteCount: number;
  /**
   * Monto total acumulado de NCs detectadas (signo positivo). No se resta de
   * `pendingAtCutoff`; se expone para auditoría visual.
   */
  creditNoteAmount: number;
  /**
   * Subconjunto de `invoiceCount` cuyo saldo pendiente (`balance_amount` o
   * fallback a `total_amount`) es estrictamente mayor a 0. Se calcula sobre
   * las mismas reglas que `pendingAtCutoff`, sin recalcular en frontend.
   */
  pendingInvoiceCount: number;
  /**
   * Ratio `collectedInPeriod / issuedInPeriod` en [0..1]. `null` si
   * `issuedInPeriod <= 0` (evita división por cero). Mide eficiencia de
   * cobranza SOBRE LO EMITIDO EN EL PERÍODO, no sobre el pendiente total
   * (que incluiría saldo anterior). Las cards solo formatean.
   */
  collectionEffectiveness: number | null;
  /**
   * Fuente del aging para esta moneda (ZETA-08):
   *   - `real`     → 100% pending invoices usan `due_date` real (zeta_cuotas_v1).
   *   - `synthetic`→ 100% pending invoices usan sintético `issue_date + 30`.
   *   - `mixed`    → coexisten real + sintético (UI debería badge-ear).
   *   - `none`     → no hay pending invoices en la moneda.
   */
  agingSource: AgingSource;
};

export type ClientStaleness = {
  companyId: string;
  companyName: string | null;
  /** Nombre en facturas Zeta (`zeta_cliente_nombre`), si difiere de proto_companies. */
  zetaClientName?: string | null;
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
  /** Facturas con deuda abierta y missing_count >= 1 (warning activo). */
  warned: number;
  /** Facturas con missing_count >= 3, balance > 0, pendientes de auto-cierre. */
  pending_auto_close: number;
  /** Metadata orphan obsoleta (ya cerradas / balance 0) — informativo. */
  stale_metadata: number;
  /** Total pending balance in active warned invoices by currency. */
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
  /**
   * Facturas excluidas por política MIN_FINANCIAL_DATE (issue_date < 2026-01-01).
   * Son visibles en DB pero no participan en ningún cálculo financiero.
   */
  excludedByMinFinancialDateCount: number;
  /**
   * Recibos excluidos por política MIN_FINANCIAL_DATE (receipt_date < 2026-01-01).
   */
  excludedByMinFinancialDateReceiptCount: number;
  /** Caps de carga paginada (A-02). severity solo si hubo truncamiento por maxRows. */
  diagnostics?: FinancialReconciliationDiagnostics;
};

export type DatasetCapsSeverity = "warning" | "critical";

export type FinancialReconciliationDatasetCaps = {
  row_cap: number;
  isTruncated: boolean;
  tables_at_cap: string[];
  /** null si no hubo truncamiento; critical si proto_invoices alcanzó el cap. */
  severity: DatasetCapsSeverity | null;
  pages_fetched: Partial<Record<"proto_invoices" | "proto_receipts" | "proto_companies", number>>;
  note: string;
};

/** ZETA-08 Fase 0 — cobertura de cuotas vs rollup `due_date` en facturas. */
export type InstallmentCoverageDiagnostics = {
  coveragePct: number;
  syntheticPct: number;
  orphanCount: number;
  minDateTrapCount: number;
  balanceMismatchCount: number;
  /** Facturas con balance > 0 (denominador de coverage/synthetic). */
  pendingInvoiceCount: number;
  realDueDateInvoiceCount: number;
  syntheticDueDateInvoiceCount: number;
  /** status=partial y al menos una cuota vencida con saldo. */
  partialWithOverdueCount: number;
  /** Clientes con overdue por cuota pero ninguna factura overdue por due_date rollup. */
  underestimatedClientCount: number;
  installmentRowCount: number;
  linkedInstallmentCount: number;
  /** Shadow del motor Fase 1 (sin cambiar aging de cartera). */
  installmentAging: {
    dominantRange: string | null;
    hasMixedAging: boolean;
    overdueInstallments: number;
    overdueInvoiceCount: number;
  };
  note: string;
};

export type FinancialReconciliationDiagnostics = {
  dataset_caps: FinancialReconciliationDatasetCaps;
  /** Ausente si la tabla no existe o falló la carga (degradación). */
  installment_coverage?: InstallmentCoverageDiagnostics;
  /** ZETA-08 Fase 2: shadow aging comparativo. Ausente en modo legacy o si falló la carga. */
  aging_comparative?: AgingComparativeDiagnostics;
  /** ZETA-08 Fase 2: observation layer — top clientes subestimados, overdue oculto y readiness GO/NO-GO. */
  aging_observation?: InstallmentAgingObservationDiagnostics;
};

export type GenerateFinancialConsistencyReportInput = {
  workspaceId: string;
  invoices: InvoiceInput[];
  companies: CompanyInput[];
  syncStates: SyncStateInput[];
  /**
   * Recibos sincronizados desde Zeta (`proto_receipts`). Si se omiten, las
   * métricas `collectedInPeriod` y `openingBalance` no se pueden calcular
   * confiablemente y se reportan en 0 (el motor degrada sin lanzar). Para
   * cumplir el contrato contable de `/copilot/cartera`, el caller DEBE
   * cargar los recibos en período + pre-período.
   */
  receipts?: ReceiptInput[];
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
  /** Caps de dataset paginado (lo arma el route; el motor solo lo expone). */
  diagnostics?: FinancialReconciliationDiagnostics;
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

const DAY_MS = 1000 * 60 * 60 * 24;

function parseYmdToMs(s: string | null | undefined): number | null {
  const d = (s ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const ms = Date.parse(d);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Aging actual (legacy): bucket por días desde `issue_date`.
 *
 * Mantenido como fallback explícito cuando NO existe `due_date` real
 * (ZETA-08 incompleto para la factura) o cuando `due_date_source !== 'zeta_cuotas_v1'`.
 */
function computeAgingRange(
  issueDateStr: string | null | undefined,
  nowMs: number
): AgingRange | null {
  const ms = parseYmdToMs(issueDateStr);
  if (ms === null) return null;
  const days = Math.max(0, Math.floor((nowMs - ms) / DAY_MS));
  if (days <= 30) return "0_30";
  if (days <= 60) return "31_60";
  if (days <= 90) return "61_90";
  return "90_plus";
}

/**
 * Aging por `days_past_due` real cuando hay vencimiento cierto. Se aplica
 * únicamente cuando el caller pasa `due_date` y `due_date_source = 'zeta_cuotas_v1'`
 * (origen `RESTCuotasV1QueryCliente` → `proto_invoice_installments`).
 *
 * Mapeo (semántica `days past due`):
 *   - days <= 30 (incluye negativos = vigente)  → "0_30"
 *   - 31..60                                      → "31_60"
 *   - 61..90                                      → "61_90"
 *   - >90                                         → "90_plus"
 *
 * Esta semántica NO es igual a la del fallback sintético (que cuenta días
 * desde emisión, no desde vencimiento). Por eso reportamos `aging_source`
 * a nivel de moneda y bucket — la UI puede badge-ear divergencias.
 */
function computeAgingRangeByDueDate(
  dueDateStr: string | null | undefined,
  nowMs: number
): AgingRange | null {
  const ms = parseYmdToMs(dueDateStr);
  if (ms === null) return null;
  const daysPastDue = Math.floor((nowMs - ms) / DAY_MS);
  if (daysPastDue <= 30) return "0_30";
  if (daysPastDue <= 60) return "31_60";
  if (daysPastDue <= 90) return "61_90";
  return "90_plus";
}

/**
 * Resuelve el bucket de aging para una factura.
 *
 * Prioridad:
 *   1. Si `due_date_source === 'zeta_cuotas_v1'` Y `due_date` parseable → REAL.
 *   2. Fallback: legacy `now − issue_date`.
 *
 * Devuelve `{ range, source }`. `source = 'real'` solo si se usó due_date real;
 * de lo contrario `'synthetic'`.
 */
function resolveAging(
  inv: InvoiceInput,
  nowMs: number
): { range: AgingRange; source: "real" | "synthetic" } | null {
  if (inv.due_date_source === "zeta_cuotas_v1") {
    const real = computeAgingRangeByDueDate(inv.due_date, nowMs);
    if (real !== null) return { range: real, source: "real" };
  }
  const synth = computeAgingRange(inv.issue_date, nowMs);
  if (synth !== null) return { range: synth, source: "synthetic" };
  return null;
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

  // --- excludedHistorical: raw input, before MIN filter (audit / explainability only) ---
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

  // --- MIN_FINANCIAL_DATE hard exclusion (policy floor, query-level) ---
  //
  // Comprobantes con fecha anterior a MIN_FINANCIAL_DATE son excluidos de TODOS
  // los cálculos operativos: cartera, aging, pendiente, KPIs, ratios, reconciliation.
  // Los registros físicos NO se borran — solo se excluyen lógicamente aquí.
  // excludedHistorical (arriba) sigue reportando el saldo histórico excluido para UI.
  let excludedByMinFinancialDateCount = 0;
  let excludedByMinFinancialDateReceiptCount = 0;

  const invoices: InvoiceInput[] = [];
  for (const inv of input.invoices) {
    const d = (inv.issue_date ?? "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < MIN_FINANCIAL_DATE) {
      if (!isVoided(inv.status)) excludedByMinFinancialDateCount++;
      continue;
    }
    invoices.push(inv);
  }

  const receiptsProvided = input.receipts !== undefined;
  const receipts: ReceiptInput[] = [];
  for (const rec of input.receipts ?? []) {
    const d = (rec.receipt_date ?? "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < MIN_FINANCIAL_DATE) {
      if (!isVoided(rec.status ?? null)) excludedByMinFinancialDateReceiptCount++;
      continue;
    }
    receipts.push(rec);
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
    /** Σ total_amount de NCs detectadas (period_only). */
    creditNoteAmount: number;
    /** Cantidad de NCs detectadas (period_only). */
    creditNoteCount: number;
  };
  const buckets: Partial<Record<string, Bucket>> = {};

  // Acumulación adicional para opening: NCs pre-período reducen el saldo
  // anterior reconstruido. Se acumulan por moneda.
  const creditNotePrePeriodByCurrency: Partial<
    Record<ReconciliationCurrencyCode, number>
  > = {};

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
  const clientZetaNameById = new Map<string, string>();

  // Aging accumulation: per-currency per-range (pending invoices only)
  type AgingBucketAccum = {
    amount: number;
    invoiceCount: number;
    clients: Set<string>;
    /** Cuántas facturas usaron due_date real (zeta_cuotas_v1). */
    realCount: number;
    /** Cuántas facturas usaron sintético (issue_date + 30). */
    syntheticCount: number;
  };
  type AgingCurrAccum = Record<AgingRange, AgingBucketAccum>;
  const agingAccum = new Map<ReconciliationCurrencyCode, AgingCurrAccum>();
  function newBucketAccum(): AgingBucketAccum {
    return {
      amount: 0,
      invoiceCount: 0,
      clients: new Set(),
      realCount: 0,
      syntheticCount: 0,
    };
  }
  function getOrCreateAgingAccum(code: ReconciliationCurrencyCode): AgingCurrAccum {
    let cur = agingAccum.get(code);
    if (!cur) {
      cur = {
        "0_30": newBucketAccum(),
        "31_60": newBucketAccum(),
        "61_90": newBucketAccum(),
        "90_plus": newBucketAccum(),
      };
      agingAccum.set(code, cur);
    }
    return cur;
  }

  // Conteo per-currency de fuentes de aging para derivar `agingSource`.
  type AgingSourceAccum = { real: number; synthetic: number };
  const agingSourceAccum = new Map<ReconciliationCurrencyCode, AgingSourceAccum>();
  function bumpAgingSource(code: ReconciliationCurrencyCode, source: "real" | "synthetic") {
    let cur = agingSourceAccum.get(code);
    if (!cur) {
      cur = { real: 0, synthetic: 0 };
      agingSourceAccum.set(code, cur);
    }
    cur[source]++;
  }

  // Per-client aging amounts: companyId → range → pending sum
  const clientAgingAmounts = new Map<string, Record<AgingRange, number>>();

  let pre2026Count = 0;

  // Period pass: only accumulates bucket metrics (issuedInPeriod, pendingInPeriod,
  // invoiceCount, creditNotes). Per-client tracking and aging are handled separately
  // in the portfolio pass below so that pre-period debtors are included.
  for (const inv of invoices) {
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

    // Currency accumulation (period metrics only)
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
      creditNoteAmount: 0,
      creditNoteCount: 0,
    };
    // NCs (opt-in vía `is_credit_note`): no aportan a `issuedInPeriod`
    // (no son venta nueva) y tampoco se suman a deuda. No se netean contra
    // `totalPending`: `balance_amount` ya viene neto desde Zeta por comprobante.
    if (inv.is_credit_note === true) {
      b.creditNoteAmount = round2(b.creditNoteAmount + totalAmount);
      b.creditNoteCount++;
    } else {
      b.totalInvoiced = round2(b.totalInvoiced + totalAmount);
      b.totalPending = round2(b.totalPending + pendingAmount);
      b.invoiceCount++;
      if (pendingAmount > 0) b.pendingInvoiceCount++;
    }
    buckets[code] = b;
  }

  const currencyOrder: ReconciliationCurrencyCode[] = ["USD", "UYU"];

  // --- Receipts pass: collectedInPeriod + openingBalance (ledger pre-period) ---
  //
  // Separamos cobranza del período (matemática con "Emitido del período") de
  // la base contable acumulada (saldo anterior). Zeta no expone snapshot
  // histórico de saldos a fecha X, así que reconstruimos opening como
  // `Σ(invoices.total_amount pre-period) − Σ(receipts.amount pre-period)`.
  // Limitación: ignora notas de crédito (DIV-003) y depende de que recibos
  // anteriores al período estén sincronizados (DIV-005).
  //
  // Backward compat: si el caller NO pasa `receipts`, mantenemos la
  // semántica legacy donde `totalCollected = max(0, totalInvoiced − totalPending)`.
  // Esto es necesario para no romper tests y consumidores que aún no
  // alimentan recibos al motor. La nueva card "Cobrado en período" sólo
  // se activa cuando hay datos reales (`receiptsProvided === true`).
  const collectedInPeriodByCurrency: Partial<Record<ReconciliationCurrencyCode, number>> = {};
  const collectedReceiptCountByCurrency: Partial<Record<ReconciliationCurrencyCode, number>> = {};
  const collectedPrePeriodByCurrency: Partial<Record<ReconciliationCurrencyCode, number>> = {};

  for (const rec of receipts) {
    if (isVoided(rec.status ?? null)) continue;
    const code = (rec.currency_code ?? "").trim().toUpperCase();
    if (!VALID_CURRENCIES.has(code)) continue;
    const cc = code as ReconciliationCurrencyCode;
    const amount = round2(Math.max(0, safeNum(rec.amount)));
    if (!(amount > 0)) continue;
    const rDate = (rec.receipt_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rDate)) continue;

    if (usePeriodFilter) {
      if (rDate < periodStart!) {
        collectedPrePeriodByCurrency[cc] = round2(
          (collectedPrePeriodByCurrency[cc] ?? 0) + amount
        );
      } else if (rDate <= periodEnd!) {
        collectedInPeriodByCurrency[cc] = round2(
          (collectedInPeriodByCurrency[cc] ?? 0) + amount
        );
        collectedReceiptCountByCurrency[cc] =
          (collectedReceiptCountByCurrency[cc] ?? 0) + 1;
      }
      // Recibos posteriores al `Hasta` se ignoran a propósito para
      // mantener fidelidad con el cierre del período.
    } else {
      // Sin filtro de período: todo el cobro va a "collectedInPeriod" para
      // que las cards no muestren 0 cuando se usa `all_outstanding`. No
      // hay opening balance en este modo (sería la suma completa, que es
      // engañosa para cards ejecutivas).
      collectedInPeriodByCurrency[cc] = round2(
        (collectedInPeriodByCurrency[cc] ?? 0) + amount
      );
      collectedReceiptCountByCurrency[cc] =
        (collectedReceiptCountByCurrency[cc] ?? 0) + 1;
    }
  }

  // Invoices pre-period: sumar `total_amount` (para opening) y
  // `balance_amount > 0` (para pendingAtCutoff acumulado).
  // Las NCs pre-período se acumulan separadas en `creditNotePrePeriodByCurrency`
  // para restarlas del opening (afectan saldo anterior, no facturación previa).
  const invoicedPrePeriodByCurrency: Partial<Record<ReconciliationCurrencyCode, number>> = {};
  const pendingPrePeriodByCurrency: Partial<Record<ReconciliationCurrencyCode, number>> = {};
  if (usePeriodFilter) {
    for (const inv of invoices) {
      if (isVoided(inv.status)) continue;
      const issueSl = (inv.issue_date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(issueSl)) continue;
      if (!(issueSl < periodStart!)) continue;
      const code = (inv.currency_code ?? "").trim().toUpperCase();
      if (!VALID_CURRENCIES.has(code)) continue;
      const cc = code as ReconciliationCurrencyCode;
      const total = round2(Math.max(0, safeNum(inv.total_amount)));
      if (!(total > 0)) continue;
      // NCs pre-período: van al crédito, no a facturado previo.
      if (inv.is_credit_note === true) {
        creditNotePrePeriodByCurrency[cc] = round2(
          (creditNotePrePeriodByCurrency[cc] ?? 0) + total
        );
        continue;
      }
      invoicedPrePeriodByCurrency[cc] = round2(
        (invoicedPrePeriodByCurrency[cc] ?? 0) + total
      );
      const rawBal = inv.balance_amount;
      const pending = rawBal == null ? total : round2(Math.max(0, safeNum(rawBal)));
      if (pending > 0) {
        pendingPrePeriodByCurrency[cc] = round2(
          (pendingPrePeriodByCurrency[cc] ?? 0) + pending
        );
      }
    }
  }

  // --- Portfolio pass: per-client tracking + aging ---
  // Drives staleClients, agingByCurrency, and ClientDebtExplorer.
  // When a period filter is active, includes ALL invoices up to periodEnd so
  // that pre-period debtors with open balances appear in the Explorer and Aging.
  // NCs are skipped: they are not open debt.
  for (const inv of invoices) {
    if (isVoided(inv.status)) continue;

    if (usePeriodFilter) {
      const issueSl = (inv.issue_date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(issueSl) || issueSl > periodEnd!) continue;
    }

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

    if (inv.is_credit_note === true) continue;

    const portCode = (inv.currency_code ?? "").trim().toUpperCase();
    if (!portCode || !VALID_CURRENCIES.has(portCode)) continue;

    const portTotal = round2(Math.max(0, safeNum(inv.total_amount)));
    if (!(portTotal > 0)) continue;

    const portRawBal = inv.balance_amount;
    const portPending =
      portRawBal == null
        ? portTotal
        : round2(Math.max(0, safeNum(portRawBal)));

    if (companyId) {
      const cur = clientPendingByCurrency.get(companyId) ?? {};
      const cc = portCode as ReconciliationCurrencyCode;
      cur[cc] = round2(Math.max(0, (cur[cc] ?? 0) + portPending));
      clientPendingByCurrency.set(companyId, cur);
      const zetaName = inv.zeta_client_name?.trim();
      if (zetaName && !clientZetaNameById.has(companyId)) {
        clientZetaNameById.set(companyId, zetaName);
      }
    }

    if (portPending > 0) {
      const ag = resolveAging(inv, nowMs);
      if (ag !== null) {
        const cc = portCode as ReconciliationCurrencyCode;
        const accum = getOrCreateAgingAccum(cc);
        const bk = accum[ag.range];
        bk.amount = round2(bk.amount + portPending);
        bk.invoiceCount++;
        if (companyId) bk.clients.add(companyId);
        if (ag.source === "real") bk.realCount++;
        else bk.syntheticCount++;
        bumpAgingSource(cc, ag.source);

        if (companyId) {
          let cliAg = clientAgingAmounts.get(companyId);
          if (!cliAg) {
            cliAg = { "0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 };
            clientAgingAmounts.set(companyId, cliAg);
          }
          cliAg[ag.range] = round2(cliAg[ag.range] + portPending);
        }
      }
    }
  }

  function openingBalanceFor(cc: ReconciliationCurrencyCode): number {
    if (!usePeriodFilter) return 0;
    const inv = invoicedPrePeriodByCurrency[cc] ?? 0;
    const col = collectedPrePeriodByCurrency[cc] ?? 0;
    const nc = creditNotePrePeriodByCurrency[cc] ?? 0;
    return round2(Math.max(0, inv - col - nc));
  }

  /**
   * "Pendiente al corte": equivale al reporte "Comprobantes Pendientes" de
   * Zeta cuando se le pide saldo a `periodEnd`. Incluye facturas pre-período
   * que aún tienen `balance_amount > 0` (la deuda anterior no desaparece sólo
   * porque cambia el filtro de período).
   *
   * Notas de Crédito:
   *  - No se netean contra `pendingAtCutoff`. Este campo debe coincidir con la
   *    suma de saldos vivos por factura (`balance_amount > 0`) al corte. Las
   *    NCs se reportan aparte en `creditNoteAmount`; restarlas acá duplica el
   *    descuento cuando Zeta ya actualizó el saldo de las facturas.
   *
   * En modo `all_outstanding` no hay pre-período, así que es igual a
   * `totalPending` del bucket (alias legacy mantiene compat).
   */
  function pendingAtCutoffFor(cc: ReconciliationCurrencyCode): number {
    const inPeriod = buckets[cc]?.totalPending ?? 0;
    const prePeriod = pendingPrePeriodByCurrency[cc] ?? 0;
    return round2(Math.max(0, inPeriod + prePeriod));
  }

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
        realDueDateCount: b.realCount,
        syntheticDueDateCount: b.syntheticCount,
      };
    });
  }

  /** Deriva `agingSource` por moneda a partir del conteo real vs sintético. */
  function agingSourceFor(cc: ReconciliationCurrencyCode): AgingSource {
    const acc = agingSourceAccum.get(cc);
    if (!acc) return "none";
    if (acc.real > 0 && acc.synthetic === 0) return "real";
    if (acc.synthetic > 0 && acc.real === 0) return "synthetic";
    if (acc.real > 0 && acc.synthetic > 0) return "mixed";
    return "none";
  }

  // Conjunto de monedas activas:
  //  - Si el caller pasó `receipts`: incluir monedas con facturas O cobros
  //    del período. Saldo anterior solo no alcanza para activar la moneda
  //    (sería un caso degenerado: hubo facturación previa pero ningún
  //    movimiento en el rango — no aporta a las cards ejecutivas).
  //  - Si NO pasó receipts (modo legacy): SOLO mirar facturas, igual que el
  //    motor previo. Evita romper tests y consumidores que aún no
  //    alimentan recibos.
  const currencies: CurrencyReconciliation[] = currencyOrder
    .filter((code) => {
      const hasInvoices = (buckets[code]?.invoiceCount ?? 0) > 0;
      if (!receiptsProvided) return hasInvoices;
      const hasCollections = (collectedInPeriodByCurrency[code] ?? 0) > 0;
      return hasInvoices || hasCollections;
    })
    .map((code) => {
      const b = buckets[code] ?? {
        totalPending: 0,
        totalInvoiced: 0,
        invoiceCount: 0,
        pendingInvoiceCount: 0,
        creditNoteAmount: 0,
        creditNoteCount: 0,
      };
      const issuedInPeriod = b.totalInvoiced;
      const pendingInPeriod = b.totalPending; // alias legacy: solo facturas del período
      const pendingAtCutoff = pendingAtCutoffFor(code); // incluye pre-período (Comprobantes Pendientes Zeta)
      const collectedInPeriod = collectedInPeriodByCurrency[code] ?? 0;
      const collectedReceiptCount = collectedReceiptCountByCurrency[code] ?? 0;
      const openingBalance = openingBalanceFor(code);

      // `totalCollected` (legacy alias): cuando hay receipts, refleja
      // `collectedInPeriod` (verdad contable). Cuando NO hay receipts,
      // usa fórmula histórica `max(0, issued − pending)` para compat con
      // tests y UIs antiguas que aún no consumen el nuevo campo.
      const totalCollectedLegacy = round2(
        Math.max(0, issuedInPeriod - pendingAtCutoff)
      );
      const totalCollected = receiptsProvided
        ? collectedInPeriod
        : totalCollectedLegacy;

      // `collectionEffectiveness`:
      //  - Con receipts: ratio cobranza_período / emitido_período (verdad
      //    contable: mide eficiencia sobre lo emitido en el período sin
      //    contaminar con cobros de saldo anterior).
      //  - Sin receipts: ratio legacy (issued − pending) / issued. Para
      //    consumidores legacy que aún no alimentan recibos.
      const numeratorForEffectiveness = receiptsProvided
        ? collectedInPeriod
        : totalCollectedLegacy;
      const collectionEffectiveness =
        issuedInPeriod > 0
          ? Math.max(
              0,
              Math.min(1, numeratorForEffectiveness / issuedInPeriod)
            )
          : null;

      return {
        currencyCode: code,
        // Aliases legacy (NO incluyen pre-período para mantener compat).
        totalInvoiced: issuedInPeriod,
        totalPending: pendingInPeriod,
        totalCollected,
        // Nuevos campos canónicos con semántica contable explícita.
        issuedInPeriod,
        pendingAtCutoff,
        previousPending: pendingPrePeriodByCurrency[code] ?? 0,
        collectedInPeriod,
        collectedReceiptCount,
        openingBalance,
        invoiceCount: b.invoiceCount,
        pendingInvoiceCount: b.pendingInvoiceCount,
        creditNoteCount: b.creditNoteCount,
        creditNoteAmount: b.creditNoteAmount,
        collectionEffectiveness,
        agingSource: agingSourceFor(code),
      };
    });

  // --- Sync states ---
  const syncStates: SyncStateSummary[] = input.syncStates.map((s) => {
    const hours = hoursElapsed(s.last_success_at, nowMs);
    return {
      resource_flow: s.resource_flow,
      last_success_at: s.last_success_at,
      bootstrap_completed: s.bootstrap_completed,
      ageHours: hours !== null ? round2(hours) : null,
      status: stalenessFromHoursForResourceFlow(hours, s.resource_flow),
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
      zetaClientName: clientZetaNameById.get(companyId) ?? null,
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
    stale_metadata: 0,
    warnedPendingByCurrency: {},
  };
  for (const inv of invoices) {
    const view = {
      reconciliation_missing_count: inv.reconciliation_missing_count,
      balance_amount: inv.balance_amount,
      status: inv.status,
    };
    if (isStaleOrphanMetadata(view)) {
      orphanSummary.stale_metadata++;
      continue;
    }
    if (!isActiveOrphanWarning(view)) continue;
    orphanSummary.warned++;
    if ((inv.reconciliation_missing_count ?? 0) >= 3) {
      orphanSummary.pending_auto_close++;
    }
    const code = (inv.currency_code ?? "").trim().toUpperCase() as ReconciliationCurrencyCode;
    if (VALID_CURRENCIES.has(code)) {
      const pending =
        inv.balance_amount != null
          ? Math.max(0, safeNum(inv.balance_amount))
          : safeNum(inv.total_amount);
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
    excludedByMinFinancialDateCount,
    excludedByMinFinancialDateReceiptCount,
    diagnostics: input.diagnostics,
  };
}
