import { loadCashflowEngineDatasetRows } from "@/lib/data/proto-analytics-read-repository";
import { supabase } from "@/lib/supabase-client";

export type CashflowObligationInput = {
  id: string;
  due_date: string;
  estimated_amount: number;
};

export type ClientPaymentBehavior = {
  avg_days_to_pay: number;
  on_time_rate: number;
};

export type ProjectedCoverageResult = {
  available_cash: number;
  expected_inflows: number;
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

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function ymd(iso: string): string {
  const s = String(iso ?? "").trim();
  if (s.length >= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** Hoy en calendario local (YYYY-MM-DD), alineado con lectura operativa. */
function localTodayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Probabilidad de cobro en factura: 0–1; si viene como 0–100 se normaliza.
 * Sin dato útil → 0,6 (neutro, mismo orden que el factor medio histórico).
 */
export function normalizedCollectionProbability(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0.6;
  let p = num(raw);
  if (!Number.isFinite(p) || p < 0) return 0.6;
  if (p > 1) p = p / 100;
  if (p > 1) p = 1;
  return p;
}

function sumReceiptAmounts(rows: ReceiptRow[]): number {
  let t = 0;
  for (const r of rows) {
    const n = num(r.amount);
    if (n > 0) t += n;
  }
  return t;
}

function sumPaymentAmounts(rows: PaymentRow[]): number {
  let t = 0;
  for (const r of rows) {
    const n = num(r.amount);
    if (n > 0) t += n;
  }
  return t;
}

/** Caja actual: recibos − pagos históricos (todo el dataset cargado). */
export function availableCashFromDataset(ds: CashflowEngineDataset): number {
  return sumReceiptAmounts(ds.receipts) - sumPaymentAmounts(ds.payments);
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

    const issueY = ymd(String(inv.issue_date ?? ""));
    const dueY = ymd(String(inv.due_date ?? ""));
    const recY = ymd(String(rec.receipt_date ?? ""));
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

function addDaysFromYmd(issueYmd: string, days: number): string {
  const base = issueYmd.slice(0, 10);
  const parts = base.split("-").map((x) => Number(x));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return base;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return base;
  dt.setDate(dt.getDate() + Math.round(days));
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Egresos **futuros** (después de hoy) hasta el vencimiento fiscal inclusive.
 * No incluye pagos ya reflejados en `available_cash`, evita doble descuento.
 */
function expectedFutureOutflowsThroughDue(
  payments: PaymentRow[],
  todayYmdStr: string,
  obligationDueYmd: string
): number {
  let t = 0;
  for (const p of payments) {
    const py = ymd(String(p.payment_date ?? ""));
    if (!py || py <= todayYmdStr || py > obligationDueYmd) continue;
    t += num(p.amount);
  }
  return t;
}

/**
 * Cobranza esperada: `balance_amount * collection_probability` solo si la fecha
 * esperada de cobro (emisión + días promedio del cliente) cae a más tardar el vencimiento fiscal.
 */
function expectedInflowsBeforeDue(
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

    const issueY = ymd(String(inv.issue_date ?? ""));
    const dueInv = ymd(String(inv.due_date ?? ""));
    const expectedPayY = issueY
      ? addDaysFromYmd(issueY, Math.round(b.avg_days_to_pay))
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
  expectedInflows: number,
  expectedOutflows: number,
  projectedBalance: number,
  estimatedAmount: number
): string {
  const inflowHelps = expectedInflows >= estimatedAmount * 0.2;
  const outflowPressure = expectedOutflows >= estimatedAmount * 0.25;

  if (status === "critical") {
    if (outflowPressure && projectedBalance < 0) {
      return "No alcanza la caja proyectada por egresos previstos";
    }
    if (projectedBalance < 0 && expectedInflows < estimatedAmount * 0.1) {
      return "No alcanza la caja proyectada";
    }
    if (expectedInflows >= estimatedAmount * 0.15) {
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
  if (availableCash >= estimatedAmount * 0.85 && expectedInflows < estimatedAmount * 0.15) {
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
  const dueY = ymd(obligation.due_date);
  const est = Math.max(0, obligation.estimated_amount);
  const available_cash = availableCashFromDataset(dataset);
  const expected_inflows = expectedInflowsBeforeDue(dueY, dataset, behaviorCache);
  const expected_outflows = expectedFutureOutflowsThroughDue(
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
  const raw = await loadCashflowEngineDatasetRows(supabase);
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
  todayYmdStr: string = localTodayYmd()
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
  const todayYmdStr = localTodayYmd();
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
