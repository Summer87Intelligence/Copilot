import type { SupabaseClient } from "@supabase/supabase-js";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import {
  addCalendarDaysLocal,
  historicalCashNet,
  localCalendarTodayYmd,
  normalizedCollectionProbability,
  num,
  sumPositivePaymentAmounts,
  sumPositiveReceiptAmounts,
  ymdFromIsoLocal,
} from "@/lib/copilot-financial-primitives";
import {
  FINANCIAL_SNAPSHOT_ROW_CAP,
  loadFinancialSnapshotRows as loadFinancialSnapshotRowsFromRepo,
  type FinancialSnapshotLoadDiagnostics,
} from "@/lib/data/proto-analytics-read-repository";
import {
  snapshotCoverageRatio,
  snapshotExpectedOutflowsTotal,
  snapshotLiquidityBalance,
  snapshotRiskBand,
} from "@/lib/copilot-financial-snapshot-selectors";

/*
 * Motor de snapshot de liquidez global (empresa en una fecha de corte).
 *
 * Pregunta de negocio: liquidez consolidada al as_of, con egresos operativos futuros y
 * obligaciones fiscales dentro de un horizonte fijo de 30 días.
 *
 * Horizonte: as_of + 30 días para fiscal; pagos operativos con payment_date estrictamente
 * posterior a as_of.
 *
 * Inflows ponderados: todas las facturas abiertas del load × collection_probability.
 * Outflows: pagos operativos futuros positivos + saldo fiscal pendiente en horizonte
 * (neteado con pagos paid por obligación).
 *
 * No comparar 1:1 con ProjectedCoverageResult de copilot-cashflow-engine (obligación puntual).
 * Ver lib/copilot-liquidity-motors.md. Datos: loadFinancialSnapshotRows; fechas: ymdFromIsoLocal.
 *
 * Deprecación controlada (legacy plano + v1 canónico)
 * -------------------------------------------------
 * Los KPI planos (`FinancialSnapshot`) siguen **poblados y expuestos solo por compatibilidad**
 * con clientes y JSON histórico. **Código nuevo** debe usar el tipo `FinancialSnapshotApiV1` y
 * lecturas numéricas vía `lib/copilot-financial-snapshot-selectors.ts` (no depender de accesos
 * directos a `available_cash`, `expected_*`, `projected_balance`, `coverage_ratio`, `risk_level`).
 *
 * **No retirar ni acortar en esta fase:** `buildFinancialSnapshotFromRows`,
 * `buildFinancialSnapshotApiV1FromRows`, `mergeFinancialSnapshotApiV1`, ni los fallbacks
 * `??` a campos planos dentro de los selectores; son el puente hasta una eliminación de legacy
 * acordada a nivel contrato HTTP.
 */

/** Banda de riesgo del snapshot global (cobertura frente a egresos esperados del snapshot). */
export type FinancialRiskLevel = "low" | "medium" | "high" | "critical";

/**
 * KPI planos del motor: **compatibilidad / transición únicamente** (misma forma que respuestas
 * antiguas y merge con v1). Los campos siguen vivos en el payload para no romper integraciones;
 * no son la vía recomendada para lectura en código nuevo.
 *
 * @deprecated Para tipar y consumir datos preferí `FinancialSnapshotApiV1` y los selectores de
 *   `copilot-financial-snapshot-selectors`. Los bloques canónicos son `realized`, `expected`,
 *   `projected` en la respuesta de `GET /api/copilot/financial-snapshot`.
 */
export type FinancialSnapshot = {
  /** @deprecated → `realized.cash_net` */
  available_cash: number;
  /**
   * @deprecated → `expected.receivables_risk_weighted`
   * @remarks **Solo snapshot global:** Σ facturas abiertas (balance &gt; 0) × probabilidad.
   * No es el `expected_inflows` del motor de cobertura por obligación (`copilot-cashflow-engine`).
   */
  expected_inflows: number;
  /**
   * @deprecated → `expected.outflows_operational_scheduled + expected.outflows_fiscal_due`
   * @remarks **Solo snapshot global:** pagos operativos post-`as_of` + fiscal pendiente a 30 días.
   * No es el `expected_outflows` acotado al vencimiento de una obligación en cashflow-engine.
   */
  expected_outflows: number;
  /** @deprecated → `projected.liquidity_balance` */
  projected_balance: number;
  /** @deprecated → `projected.coverage_ratio` */
  coverage_ratio: number;
  /** @deprecated → `projected.risk_band` */
  risk_level: FinancialRiskLevel;
};

export const FINANCIAL_METRICS_SCHEMA_VERSION = "1.0.0" as const;

export type FinancialMetricsInvoiceFinancialsCoverage =
  FinancialSnapshotLoadDiagnostics["invoice_financials_coverage"];

export type FinancialSnapshotApiMeta = {
  tenant_scope: "workspace_company_id";
  currency: "unspecified";
  amount_scale: "unit";
  fiscal_expected_horizon_days: 30;
  operational_outflows_scope: "payment_date_strictly_after_as_of";
  receivables_expected_scope: "all_open_invoice_rows_in_load";
  balance_authoritative_source: "proto_invoices";
  row_cap: number;
};

export type FinancialSnapshotApiRealized = {
  cash_net: number;
  receipts_gross: number;
  payments_gross: number;
  tax_paid_ltd: number;
};

/**
 * Bloque “expected” del snapshot **global** (no confundir con cobertura por obligación).
 */
export type FinancialSnapshotApiExpected = {
  receivables_open_balance: number;
  /** Misma magnitud que el legacy `expected_inflows`: cobranza ponderada sobre todo el load. */
  receivables_risk_weighted: number;
  /** Pagos operativos con fecha estrictamente después de `as_of` (montos &gt; 0). */
  outflows_operational_scheduled: number;
  /** Obligaciones fiscales no pagadas con vencimiento ≤ `as_of` + 30 días, neteadas con pagos `paid`. */
  outflows_fiscal_due: number;
};

export type FinancialSnapshotApiProjected = {
  liquidity_balance: number;
  coverage_ratio: number;
  risk_band: FinancialRiskLevel;
};

export type FinancialSnapshotApiDiagnostics = {
  invoice_financials_coverage: FinancialMetricsInvoiceFinancialsCoverage;
  balance_source: "proto_invoices";
  divergences: readonly Record<string, unknown>[];
  dataset_caps: {
    row_cap: number;
    truncation_unknown: true;
    note: string;
  };
  engine_notes: readonly string[];
  snapshot_load: FinancialSnapshotLoadDiagnostics;
};

/** Respuesta canónica v1 (misma semántica numérica que `FinancialSnapshot` legacy). */
export type FinancialSnapshotCanonicalV1 = {
  metrics_schema_version: typeof FINANCIAL_METRICS_SCHEMA_VERSION;
  as_of_date: string;
  meta: FinancialSnapshotApiMeta;
  realized: FinancialSnapshotApiRealized;
  expected: FinancialSnapshotApiExpected;
  projected: FinancialSnapshotApiProjected;
  diagnostics: FinancialSnapshotApiDiagnostics;
};

/**
 * Payload de `GET /api/copilot/financial-snapshot` (y equivalentes servidor): **contrato
 * recomendado** = KPI planos (compat.) + bloques `FinancialSnapshotCanonicalV1`.
 *
 * En código nuevo: tratá valores como `FinancialSnapshotApiV1` y leé magnitudes con
 * `copilot-financial-snapshot-selectors` en lugar de los campos planos deprecados.
 */
export type FinancialSnapshotApiV1 = FinancialSnapshot & FinancialSnapshotCanonicalV1;

type ReceiptRow = { amount: unknown };
type PaymentRow = { amount: unknown; payment_date: unknown };
type InvoiceRow = { balance_amount: unknown; collection_probability: unknown };
type TaxObligationRow = {
  id: unknown;
  due_date: unknown;
  estimated_amount: unknown;
  status: unknown;
};
type TaxPaymentRow = {
  obligation_id: unknown;
  amount: unknown;
  status: unknown;
};

/** Filas mínimas para el cálculo puro del snapshot (tests y composición). */
export type FinancialEngineSnapshotRows = {
  receipts: ReadonlyArray<ReceiptRow>;
  payments: ReadonlyArray<PaymentRow>;
  invoices: ReadonlyArray<InvoiceRow>;
  taxObligations: ReadonlyArray<TaxObligationRow>;
  taxPayments: ReadonlyArray<TaxPaymentRow>;
};

/** Hoy calendario local YYYY-MM-DD */
export function financialEngineLocalTodayYmd(): string {
  return localCalendarTodayYmd();
}

/**
 * Snapshot global: pagos operativos con fecha estrictamente posterior a `as_of`
 * (solo montos &gt; 0). No usar nombre “expected outflows” fuera del contexto fiscal+30d.
 */
function sumSnapshotOperationalPaymentsStrictlyAfterAsOf(
  rows: readonly PaymentRow[],
  todayYmd: string
): number {
  let t = 0;
  for (const r of rows) {
    const py = ymdFromIsoLocal(String(r.payment_date ?? ""));
    if (!py || py <= todayYmd) continue;
    const n = num(r.amount);
    if (n > 0) t += n;
  }
  return t;
}

/**
 * Snapshot global: Σ (balance &gt; 0) × probabilidad sobre **todas** las facturas del load.
 * Distinto de la cobranza esperada ventana por obligación en `copilot-cashflow-engine`.
 */
function sumSnapshotGlobalRiskWeightedOpenReceivables(rows: readonly InvoiceRow[]): number {
  let t = 0;
  for (const inv of rows) {
    const bal = num(inv.balance_amount);
    if (bal <= 0) continue;
    const p = normalizedCollectionProbability(inv.collection_probability);
    t += bal * p;
  }
  return t;
}

/** Suma saldos abiertos (balance > 0) sin ponderar — contrato `expected.receivables_open_balance`. */
function sumOpenReceivablesBalance(rows: readonly InvoiceRow[]): number {
  let t = 0;
  for (const inv of rows) {
    const bal = num(inv.balance_amount);
    if (bal > 0) t += bal;
  }
  return t;
}

/** Impuestos pagados reconocidos (movimientos `paid`) — `realized.tax_paid_ltd` (no altera KPIs legacy). */
function sumTaxPaymentsPaidLtd(rows: readonly TaxPaymentRow[]): number {
  let t = 0;
  for (const p of rows) {
    if (String(p.status ?? "").toLowerCase() !== "paid") continue;
    const n = num(p.amount);
    if (n > 0) t += n;
  }
  return t;
}

function sumPaidForObligation(
  obligationId: string,
  payments: readonly TaxPaymentRow[]
): number {
  return payments.reduce((acc, p) => {
    if (String(p.obligation_id ?? "") !== obligationId) return acc;
    if (String(p.status ?? "").toLowerCase() !== "paid") return acc;
    return acc + num(p.amount);
  }, 0);
}

/**
 * Saldo fiscal pendiente a reconocer en egresos esperados: obligaciones no pagadas
 * con vencimiento en o antes de hoy+30 días (incluye vencidas abiertas).
 */
function sumPendingTaxOutflowsWithinDays(
  obligations: readonly TaxObligationRow[],
  taxPayments: readonly TaxPaymentRow[],
  todayYmd: string,
  horizonDays: number
): number {
  const horizonEnd = addCalendarDaysLocal(todayYmd, horizonDays);
  let t = 0;
  for (const o of obligations) {
    const st = String(o.status ?? "").toLowerCase();
    if (st === "paid") continue;
    const due = ymdFromIsoLocal(String(o.due_date ?? ""));
    if (!due || due > horizonEnd) continue;
    const id = String(o.id ?? "");
    const est = num(o.estimated_amount);
    const paid = sumPaidForObligation(id, taxPayments);
    t += Math.max(0, est - paid);
  }
  return t;
}

function riskFromCoverage(
  expectedOutflows: number,
  numerator: number
): FinancialRiskLevel {
  if (expectedOutflows <= 0) {
    return numerator >= 0 ? "low" : "critical";
  }
  const ratio = numerator / expectedOutflows;
  if (ratio < 0.5) return "critical";
  if (ratio < 0.8) return "high";
  if (ratio < 1.2) return "medium";
  return "low";
}

type FinancialSnapshotRowsBundle = {
  rows: FinancialEngineSnapshotRows;
  snapshotLoadDiagnostics: FinancialSnapshotLoadDiagnostics;
};

/**
 * Carga paralela mínima para el snapshot financiero consolidado + diagnósticos de carga.
 */
async function loadFinancialSnapshotData(
  client: SupabaseClient,
  workspaceCompanyId?: string
): Promise<FinancialSnapshotRowsBundle> {
  const raw = await loadFinancialSnapshotRowsFromRepo(client, workspaceCompanyId);
  return {
    rows: {
      receipts: raw.receipts as ReceiptRow[],
      payments: raw.payments as PaymentRow[],
      invoices: raw.invoices as InvoiceRow[],
      taxObligations: raw.taxObligations as TaxObligationRow[],
      taxPayments: raw.taxPayments as TaxPaymentRow[],
    },
    snapshotLoadDiagnostics: raw.snapshotLoadDiagnostics,
  };
}

/**
 * **Builder interno (no eliminar en deprecación controlada):** materializa los KPI planos del
 * snapshot global. Sigue siendo la fuente numérica aliasing al JSON legacy; cualquier cambio
 * aquí debe ir coordinado con `mergeFinancialSnapshotApiV1` y los selectores.
 *
 * Snapshot único: caja histórica, cobranza esperada (facturas abiertas × probabilidad),
 * egresos futuros operativos + obligaciones fiscales pendientes a 30 días,
 * balance y ratio de cobertura.
 *
 * `todayYmd` fijo permite tests deterministas (YYYY-MM-DD).
 */
export function buildFinancialSnapshotFromRows(
  rows: FinancialEngineSnapshotRows,
  todayYmd: string
): FinancialSnapshot {
  const available_cash = historicalCashNet(rows.receipts, rows.payments);

  const expected_inflows = sumSnapshotGlobalRiskWeightedOpenReceivables(rows.invoices);

  const futurePay = sumSnapshotOperationalPaymentsStrictlyAfterAsOf(rows.payments, todayYmd);
  const taxOut = sumPendingTaxOutflowsWithinDays(
    rows.taxObligations,
    rows.taxPayments,
    todayYmd,
    30
  );
  const expected_outflows = futurePay + taxOut;

  const projected_balance =
    available_cash + expected_inflows - expected_outflows;

  const numerator = available_cash + expected_inflows;
  const coverage_ratio =
    expected_outflows > 0 ? numerator / expected_outflows : numerator >= 0 ? 999 : 0;

  const risk_level = riskFromCoverage(expected_outflows, numerator);

  return {
    available_cash,
    expected_inflows,
    expected_outflows,
    projected_balance,
    coverage_ratio,
    risk_level,
  };
}

/**
 * Arma el contrato canónico v1 a partir de las mismas filas y fórmulas que el snapshot legacy
 * (sin cambiar reglas de negocio).
 */
export function buildFinancialSnapshotApiV1FromRows(
  rows: FinancialEngineSnapshotRows,
  todayYmd: string,
  snapshotLoadDiagnostics: FinancialSnapshotLoadDiagnostics
): FinancialSnapshotCanonicalV1 {
  const legacy = buildFinancialSnapshotFromRows(rows, todayYmd);

  const receipts_gross = sumPositiveReceiptAmounts(rows.receipts);
  const payments_gross = sumPositivePaymentAmounts(rows.payments);
  const futurePay = sumSnapshotOperationalPaymentsStrictlyAfterAsOf(rows.payments, todayYmd);
  const taxOut = sumPendingTaxOutflowsWithinDays(
    rows.taxObligations,
    rows.taxPayments,
    todayYmd,
    30
  );
  const receivables_open_balance = sumOpenReceivablesBalance(rows.invoices);
  const tax_paid_ltd = sumTaxPaymentsPaidLtd(rows.taxPayments);

  const meta: FinancialSnapshotApiMeta = {
    tenant_scope: "workspace_company_id",
    currency: "unspecified",
    amount_scale: "unit",
    fiscal_expected_horizon_days: 30,
    operational_outflows_scope: "payment_date_strictly_after_as_of",
    receivables_expected_scope: "all_open_invoice_rows_in_load",
    balance_authoritative_source: "proto_invoices",
    row_cap: FINANCIAL_SNAPSHOT_ROW_CAP,
  };

  const diagnostics: FinancialSnapshotApiDiagnostics = {
    invoice_financials_coverage: snapshotLoadDiagnostics.invoice_financials_coverage,
    balance_source: "proto_invoices",
    divergences: [],
    dataset_caps: {
      row_cap: FINANCIAL_SNAPSHOT_ROW_CAP,
      truncation_unknown: true,
      note:
        "Las lecturas proto_* del snapshot usan límite fijo; no se reporta fila a fila si hubo truncamiento.",
    },
    engine_notes: [
      "Snapshot global (no cobertura por obligación): receivables_risk_weighted = Σ(balance>0 × prob) sobre el load; outflows = pagos operativos post-as_of + fiscal pendiente a 30 días.",
    ],
    snapshot_load: snapshotLoadDiagnostics,
  };

  return {
    metrics_schema_version: FINANCIAL_METRICS_SCHEMA_VERSION,
    as_of_date: todayYmd,
    meta,
    realized: {
      cash_net: legacy.available_cash,
      receipts_gross,
      payments_gross,
      tax_paid_ltd,
    },
    expected: {
      receivables_open_balance,
      receivables_risk_weighted: legacy.expected_inflows,
      outflows_operational_scheduled: futurePay,
      outflows_fiscal_due: taxOut,
    },
    projected: {
      liquidity_balance: legacy.projected_balance,
      coverage_ratio: legacy.coverage_ratio,
      risk_band: legacy.risk_level,
    },
    diagnostics,
  };
}

/**
 * **Merge de compatibilidad (no eliminar en deprecación controlada):** combina KPI planos y
 * bloques v1 en un solo objeto de respuesta. El producto debe leer números vía selectores, no
 * asumir que los planos dejarán de existir hasta un cambio de contrato HTTP explícito.
 */
export function mergeFinancialSnapshotApiV1(
  legacy: FinancialSnapshot,
  canonical: FinancialSnapshotCanonicalV1
): FinancialSnapshotApiV1 {
  return { ...legacy, ...canonical };
}

/**
 * Snapshot con contrato canónico (uso servidor / ruta financial-snapshot).
 */
export async function getFinancialSnapshotForApi(
  client: SupabaseClient,
  workspaceCompanyId?: string
): Promise<FinancialSnapshotApiV1> {
  const todayYmd = financialEngineLocalTodayYmd();
  const { rows, snapshotLoadDiagnostics } = await loadFinancialSnapshotData(
    client,
    workspaceCompanyId
  );
  const legacy = buildFinancialSnapshotFromRows(rows, todayYmd);
  const canonical = buildFinancialSnapshotApiV1FromRows(
    rows,
    todayYmd,
    snapshotLoadDiagnostics
  );
  return mergeFinancialSnapshotApiV1(legacy, canonical);
}

/**
 * Snapshot único: carga desde repositorio y fecha calendario local de hoy.
 * Sin argumentos: `GET /api/copilot/financial-snapshot` (browser / sin cliente Supabase).
 */
export async function getFinancialSnapshot(): Promise<FinancialSnapshotApiV1>;
export async function getFinancialSnapshot(
  client: SupabaseClient,
  workspaceCompanyId?: string
): Promise<FinancialSnapshot>;
export async function getFinancialSnapshot(
  client?: SupabaseClient,
  workspaceCompanyId?: string
): Promise<FinancialSnapshot | FinancialSnapshotApiV1> {
  if (!client) {
    const res = await copilotApiFetch("/api/copilot/financial-snapshot");
    const json = (await res.json()) as {
      ok?: boolean;
      data?: FinancialSnapshotApiV1;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.data) {
      throw new Error(json.error ?? "No se pudo cargar el snapshot financiero.");
    }
    return json.data;
  }
  const todayYmd = financialEngineLocalTodayYmd();
  const { rows } = await loadFinancialSnapshotData(client, workspaceCompanyId);
  return buildFinancialSnapshotFromRows(rows, todayYmd);
}

/** Señales textuales derivadas del snapshot (para alertas / narrativa). */
export function getFinancialRisks(snapshot: FinancialSnapshot): string[] {
  const api = snapshot as FinancialSnapshotApiV1;
  const out: string[] = [];
  if (
    snapshotExpectedOutflowsTotal(api) > 0 &&
    snapshotCoverageRatio(api) < 1
  ) {
    out.push(
      "Los egresos esperados superan la suma de caja disponible y cobranzas ponderadas."
    );
  }
  if (snapshotLiquidityBalance(api) < 0) {
    out.push("Balance proyectado negativo con las reglas actuales de egresos.");
  }
  const band = snapshotRiskBand(api);
  if (band === "critical") {
    out.push("Riesgo de liquidez crítico (cobertura baja frente a salidas esperadas).");
  } else if (band === "high") {
    out.push("Riesgo de liquidez alto: margen de cobertura ajustado.");
  }
  return out;
}
