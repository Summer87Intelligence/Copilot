import { copilotApiFetch } from "@/lib/copilot-fetch";
import {
  addCalendarDaysLocalRoundDays,
  historicalCashNet,
  localCalendarTodayYmd,
  normalizedCollectionProbability as normalizedCollectionProbabilityFromPrimitives,
  num,
  ymdFromIsoUtcDate,
} from "@/lib/copilot-financial-primitives";

/*
 * Motor de cobertura de caja frente a una obligación fiscal puntual.
 *
 * Pregunta de negocio: dado el dataset de cashflow y una obligación (due_date + estimated_amount),
 * estimar si la caja histórica más cobros ponderados esperados hasta el vencimiento, menos
 * pagos operativos en (as_of, due], cubre el monto de la obligación.
 *
 * Horizonte: por obligación — ventana de pagos operativos (today, obligationDue]; inflows
 * solo si la fecha esperada de cobro (emisión + comportamiento del cliente) cae a más tardar
 * el vencimiento de esa obligación.
 *
 * Fechas operativas: ymdFromIsoUtcDate y addCalendarDaysLocalRoundDays (ver primitivas).
 *
 * No comparar 1:1 expected_inflows / expected_outflows con el snapshot global en
 * copilot-financial-engine. Ver lib/copilot-liquidity-motors.md.
 */

export type CashflowObligationInput = {
  id: string;
  due_date: string;
  estimated_amount: number;
};

export type ClientPaymentBehavior = {
  avg_days_to_pay: number;
  on_time_rate: number;
};

/**
 * Resultado de **cobertura por obligación** (no es un KPI de snapshot global).
 * Los campos `expected_*` están acotados al vencimiento de la obligación y a reglas de timing
 * por cliente; no deben igualarse numéricamente a `FinancialSnapshot.expected_*`.
 */
export type ProjectedCoverageResult = {
  /** Igual definición de “caja histórica” que en snapshot: Σ recibos(+) − Σ pagos(+) del dataset. */
  available_cash: number;
  /** Cobranza ponderada solo para facturas cuya fecha esperada de cobro ≤ vencimiento de la obligación. */
  expected_inflows: number;
  /** Pagos operativos con fecha en (as_of, vencimiento de la obligación] (regla distinta al snapshot). */
  expected_outflows: number;
  projected_balance: number;
  coverage_status: "covered" | "risk" | "critical";
  explanation: string;
};

type ReceiptRow = {
  amount: unknown;
  invoice_id: unknown;
  receipt_date: unknown;
  company_id: unknown;
};

type PaymentRow = {
  amount: unknown;
  payment_date: unknown;
};

type InvoiceRow = {
  id: unknown;
  company_id: unknown;
  issue_date: unknown;
  due_date: unknown;
  balance_amount: unknown;
  collection_probability: unknown;
};

export type CashflowEngineDataset = {
  receipts: ReceiptRow[];
  payments: PaymentRow[];
  invoices: InvoiceRow[];
};

/**
 * Re-export temporal: la implementación vive en `copilot-financial-primitives`.
 * @deprecated Importar desde `@/lib/copilot-financial-primitives` en código nuevo.
 */
export function normalizedCollectionProbability(raw: unknown): number {
  return normalizedCollectionProbabilityFromPrimitives(raw);
}

/** Caja actual: recibos − pagos históricos (todo el dataset cargado). */
export function availableCashFromDataset(ds: CashflowEngineDataset): number {
  return historicalCashNet(ds.receipts, ds.payments);
}

/**
 * Comportamiento histórico por cliente (solo para **timing** esperado de cobro).
 */
export function getClientPaymentBehavior(
  companyId: string,
  dataset: CashflowEngineDataset
): ClientPaymentBehavior {
  const invoiceById = new Map<string, InvoiceRow>();
  for (const inv of dataset.invoices) {
    const id = String(inv.id ?? "");
    if (id) invoiceById.set(id, inv);
  }

  const daysSamples: number[] = [];
  const onTimeFlags: number[] = [];

  for (const rec of dataset.receipts) {
    const iid = rec.invoice_id == null ? "" : String(rec.invoice_id);
    if (!iid) continue;
    const inv = invoiceById.get(iid);
    if (!inv) continue;
    const cid = inv.company_id == null ? "" : String(inv.company_id);
    if (cid !== companyId) continue;

    const issueY = ymdFromIsoUtcDate(String(inv.issue_date ?? ""));
    const dueY = ymdFromIsoUtcDate(String(inv.due_date ?? ""));
    const recY = ymdFromIsoUtcDate(String(rec.receipt_date ?? ""));
    if (!issueY || !recY) continue;

    const t0 = new Date(`${issueY}T12:00:00`).getTime();
    const t1 = new Date(`${recY}T12:00:00`).getTime();
    const days = Math.max(0, Math.round((t1 - t0) / 86400000));
    daysSamples.push(days);

    if (dueY) {
      onTimeFlags.push(recY <= dueY ? 1 : 0);
    }
  }

  if (daysSamples.length === 0) {
    return { avg_days_to_pay: 35, on_time_rate: 0.55 };
  }

  const avg_days_to_pay =
    daysSamples.reduce((a, b) => a + b, 0) / daysSamples.length;
  const on_time_rate =
    onTimeFlags.length === 0
      ? 0.55
      : onTimeFlags.reduce((a, b) => a + b, 0) / onTimeFlags.length;

  return { avg_days_to_pay, on_time_rate };
}

/**
 * Cobertura por obligación: pagos operativos con fecha en (as_of, vencimiento].
 * No incluye pagos ya reflejados en `available_cash`; regla distinta a
 * `sumSnapshotOperationalPaymentsStrictlyAfterAsOf` del snapshot global.
 */
function sumObligationCoveragePaymentsBetweenAsOfAndDue(
  payments: PaymentRow[],
  todayYmdStr: string,
  obligationDueYmd: string
): number {
  let t = 0;
  for (const p of payments) {
    const py = ymdFromIsoUtcDate(String(p.payment_date ?? ""));
    if (!py || py <= todayYmdStr || py > obligationDueYmd) continue;
    t += num(p.amount);
  }
  return t;
}

/**
 * Cobertura por obligación: Σ balance×prob solo si la fecha esperada de cobro
 * (emisión + días promedio del cliente) ≤ vencimiento de **esta** obligación.
 */
function sumObligationCoverageRiskWeightedInflowsBeforeDue(
  obligationDueYmd: string,
  dataset: CashflowEngineDataset,
  behaviorCache: Map<string, ClientPaymentBehavior>
): number {
  let total = 0;
  for (const inv of dataset.invoices) {
    const bal = num(inv.balance_amount);
    if (bal <= 0) continue;
    const cid = inv.company_id == null ? "" : String(inv.company_id);
    if (!cid) continue;

    let b = behaviorCache.get(cid);
    if (!b) {
      b = getClientPaymentBehavior(cid, dataset);
      behaviorCache.set(cid, b);
    }

    const prob = normalizedCollectionProbability(inv.collection_probability);

    const issueY = ymdFromIsoUtcDate(String(inv.issue_date ?? ""));
    const dueInv = ymdFromIsoUtcDate(String(inv.due_date ?? ""));
    const expectedPayY = issueY
      ? addCalendarDaysLocalRoundDays(issueY, Math.round(b.avg_days_to_pay))
      : dueInv
        ? dueInv
        : "";
    if (!expectedPayY || expectedPayY > obligationDueYmd) continue;

    total += bal * prob;
  }
  return total;
}

function classifyCoverage(
  projectedBalance: number,
  estimatedAmount: number
): "covered" | "risk" | "critical" {
  if (projectedBalance < 0) return "critical";
  if (projectedBalance < estimatedAmount * 0.3) return "risk";
  return "covered";
}

function buildExplanation(
  status: "covered" | "risk" | "critical",
  availableCash: number,
  /** Cobranza ponderada acotada a la obligación (no snapshot global). */
  obligationExpectedInflows: number,
  /** Pagos operativos en (as_of, due] (no outflows fiscales del snapshot). */
  obligationExpectedOutflows: number,
  projectedBalance: number,
  estimatedAmount: number
): string {
  const inflowHelps = obligationExpectedInflows >= estimatedAmount * 0.2;
  const outflowPressure = obligationExpectedOutflows >= estimatedAmount * 0.25;

  if (status === "critical") {
    if (outflowPressure && projectedBalance < 0) {
      return "No alcanza la caja proyectada por egresos previstos";
    }
    if (projectedBalance < 0 && obligationExpectedInflows < estimatedAmount * 0.1) {
      return "No alcanza la caja proyectada";
    }
    if (obligationExpectedInflows >= estimatedAmount * 0.15) {
      return "Falta cobertura pese a cobranzas esperadas (probabilidad en facturas)";
    }
    return "No alcanza la caja proyectada";
  }

  if (status === "risk") {
    if (outflowPressure && !inflowHelps) {
      return "Riesgo por egresos programados antes del vencimiento";
    }
    if (inflowHelps) {
      return "Depende de cobranzas no confirmadas (probabilidad en facturas)";
    }
    return "Riesgo por demora en cobranzas";
  }

  /* covered */
  if (
    availableCash >= estimatedAmount * 0.85 &&
    obligationExpectedInflows < estimatedAmount * 0.15
  ) {
    return "Cubierto con caja actual";
  }
  if (inflowHelps) {
    return "Cubierto con cobranzas previstas (probabilidad en facturas)";
  }
  return "Cubierto si se cobran clientes principales";
}

function projectOne(
  obligation: CashflowObligationInput,
  dataset: CashflowEngineDataset,
  behaviorCache: Map<string, ClientPaymentBehavior>,
  todayYmdStr: string
): ProjectedCoverageResult {
  const dueY = ymdFromIsoUtcDate(obligation.due_date);
  const est = Math.max(0, obligation.estimated_amount);
  const available_cash = availableCashFromDataset(dataset);
  const expected_inflows = sumObligationCoverageRiskWeightedInflowsBeforeDue(
    dueY,
    dataset,
    behaviorCache
  );
  const expected_outflows = sumObligationCoveragePaymentsBetweenAsOfAndDue(
    dataset.payments,
    todayYmdStr,
    dueY
  );
  const projected_balance =
    available_cash + expected_inflows - expected_outflows - est;

  const coverage_status = classifyCoverage(projected_balance, est);
  const explanation = buildExplanation(
    coverage_status,
    available_cash,
    expected_inflows,
    expected_outflows,
    projected_balance,
    est
  );

  return {
    available_cash,
    expected_inflows,
    expected_outflows,
    projected_balance,
    coverage_status,
    explanation,
  };
}

/** Una lectura de tablas proto para motor de cobertura (performance). */
export async function loadCashflowEngineDataset(): Promise<CashflowEngineDataset> {
  const res = await copilotApiFetch("/api/copilot/cashflow-dataset");
  const json = (await res.json()) as {
    ok?: boolean;
    data?: {
      receipts: unknown[];
      payments: unknown[];
      invoices: unknown[];
    };
    error?: string;
  };
  if (!res.ok || !json.ok || !json.data) {
    throw new Error(json.error ?? "No se pudo cargar el dataset de flujo de caja.");
  }
  const raw = json.data;
  return {
    receipts: raw.receipts as ReceiptRow[],
    payments: raw.payments as PaymentRow[],
    invoices: raw.invoices as InvoiceRow[],
  };
}

/**
 * Cobertura proyectada para varias obligaciones reutilizando el mismo dataset (una carga).
 * El ajuste por documentos (`proto_documents`) no altera estos números: vive en
 * `copilot-document-intelligence` y se aplica en alertas fiscales y texto de agenda (`getUpcomingTaxAgenda`).
 */
export function computeProjectedCoverageForAgenda(
  obligations: readonly CashflowObligationInput[],
  dataset: CashflowEngineDataset,
  todayYmdStr: string = localCalendarTodayYmd()
): Map<string, ProjectedCoverageResult> {
  const behaviorCache = new Map<string, ClientPaymentBehavior>();
  const out = new Map<string, ProjectedCoverageResult>();
  for (const o of obligations) {
    out.set(o.id, projectOne(o, dataset, behaviorCache, todayYmdStr));
  }
  return out;
}

/**
 * Motor de cobertura: caja histórica, cobranzas esperadas (`balance × collection_probability`
 * con ventana por fecha esperada de cobro), egresos **futuros** hasta el vencimiento y saldo neto.
 */
export async function getProjectedCoverageForObligation(
  obligation: CashflowObligationInput
): Promise<ProjectedCoverageResult> {
  const ds = await loadCashflowEngineDataset();
  const todayYmdStr = localCalendarTodayYmd();
  const m = computeProjectedCoverageForAgenda([obligation], ds, todayYmdStr);
  return (
    m.get(obligation.id) ?? {
      available_cash: availableCashFromDataset(ds),
      expected_inflows: 0,
      expected_outflows: 0,
      projected_balance: -obligation.estimated_amount,
      coverage_status: "critical",
      explanation: "No alcanza la caja proyectada",
    }
  );
}
