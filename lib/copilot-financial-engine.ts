import { supabase } from "@/lib/supabase-client";
import { normalizedCollectionProbability } from "@/lib/copilot-cashflow-engine";

const ROW_CAP = 5000;

export type FinancialRiskLevel = "low" | "medium" | "high" | "critical";

export type FinancialSnapshot = {
  available_cash: number;
  expected_inflows: number;
  expected_outflows: number;
  projected_balance: number;
  coverage_ratio: number;
  risk_level: FinancialRiskLevel;
};

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

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function ymdFromIso(iso: string): string {
  const s = String(iso ?? "").trim();
  if (s.length >= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Hoy calendario local YYYY-MM-DD */
export function financialEngineLocalTodayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysToYmd(ymd: string, days: number): string {
  const base = ymd.slice(0, 10);
  const parts = base.split("-").map((x) => Number(x));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return base;
  const [y, mo, da] = parts;
  const dt = new Date(y, mo - 1, da);
  if (Number.isNaN(dt.getTime())) return base;
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function sumReceiptAmounts(rows: ReceiptRow[]): number {
  let t = 0;
  for (const r of rows) {
    const n = num(r.amount);
    if (n > 0) t += n;
  }
  return t;
}

function sumPaymentAmountsAll(rows: PaymentRow[]): number {
  let t = 0;
  for (const r of rows) {
    const n = num(r.amount);
    if (n > 0) t += n;
  }
  return t;
}

/** Pagos operativos con fecha estrictamente posterior a hoy (compromisos futuros). */
function sumFutureOperationalPayments(
  rows: PaymentRow[],
  todayYmd: string
): number {
  let t = 0;
  for (const r of rows) {
    const py = ymdFromIso(String(r.payment_date ?? ""));
    if (!py || py <= todayYmd) continue;
    const n = num(r.amount);
    if (n > 0) t += n;
  }
  return t;
}

/** Facturas abiertas: cobranza esperada = balance × collection_probability */
function sumExpectedInflowsOpenInvoices(rows: InvoiceRow[]): number {
  let t = 0;
  for (const inv of rows) {
    const bal = num(inv.balance_amount);
    if (bal <= 0) continue;
    const p = normalizedCollectionProbability(inv.collection_probability);
    t += bal * p;
  }
  return t;
}

function sumPaidForObligation(
  obligationId: string,
  payments: TaxPaymentRow[]
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
  obligations: TaxObligationRow[],
  taxPayments: TaxPaymentRow[],
  todayYmd: string,
  horizonDays: number
): number {
  const horizonEnd = addDaysToYmd(todayYmd, horizonDays);
  let t = 0;
  for (const o of obligations) {
    const st = String(o.status ?? "").toLowerCase();
    if (st === "paid") continue;
    const due = ymdFromIso(String(o.due_date ?? ""));
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

/**
 * Carga paralela mínima para el snapshot financiero consolidado.
 */
async function loadFinancialSnapshotRows(): Promise<{
  receipts: ReceiptRow[];
  payments: PaymentRow[];
  invoices: InvoiceRow[];
  taxObligations: TaxObligationRow[];
  taxPayments: TaxPaymentRow[];
}> {
  const [recRes, payRes, invRes, taxObRes, taxPayRes] = await Promise.all([
    supabase
      .from("proto_receipts")
      .select("amount")
      .eq("is_active", true)
      .limit(ROW_CAP),
    supabase
      .from("proto_payments")
      .select("amount,payment_date")
      .eq("is_active", true)
      .limit(ROW_CAP),
    supabase
      .from("proto_invoices")
      .select("balance_amount,collection_probability")
      .eq("is_active", true)
      .limit(ROW_CAP),
    supabase
      .from("proto_tax_obligations")
      .select("*")
      .eq("is_active", true)
      .limit(ROW_CAP),
    supabase
      .from("proto_tax_payments")
      .select("*")
      .eq("is_active", true)
      .limit(ROW_CAP),
  ]);

  if (recRes.error) throw new Error(recRes.error.message);
  if (payRes.error) throw new Error(payRes.error.message);
  if (invRes.error) throw new Error(invRes.error.message);
  if (taxObRes.error) throw new Error(taxObRes.error.message);
  if (taxPayRes.error) throw new Error(taxPayRes.error.message);

  return {
    receipts: (recRes.data ?? []) as ReceiptRow[],
    payments: (payRes.data ?? []) as PaymentRow[],
    invoices: (invRes.data ?? []) as InvoiceRow[],
    taxObligations: (taxObRes.data ?? []) as TaxObligationRow[],
    taxPayments: (taxPayRes.data ?? []) as TaxPaymentRow[],
  };
}

/**
 * Snapshot único: caja histórica, cobranza esperada (facturas abiertas × probabilidad),
 * egresos futuros operativos + obligaciones fiscales pendientes a 30 días,
 * balance y ratio de cobertura.
 */
export async function getFinancialSnapshot(): Promise<FinancialSnapshot> {
  const todayYmd = financialEngineLocalTodayYmd();
  const rows = await loadFinancialSnapshotRows();

  const available_cash =
    sumReceiptAmounts(rows.receipts) - sumPaymentAmountsAll(rows.payments);

  const expected_inflows = sumExpectedInflowsOpenInvoices(rows.invoices);

  const futurePay = sumFutureOperationalPayments(rows.payments, todayYmd);
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

/** Señales textuales derivadas del snapshot (para alertas / narrativa). */
export function getFinancialRisks(snapshot: FinancialSnapshot): string[] {
  const out: string[] = [];
  if (snapshot.expected_outflows > 0 && snapshot.coverage_ratio < 1) {
    out.push(
      "Los egresos esperados superan la suma de caja disponible y cobranzas ponderadas."
    );
  }
  if (snapshot.projected_balance < 0) {
    out.push("Balance proyectado negativo con las reglas actuales de egresos.");
  }
  if (snapshot.risk_level === "critical") {
    out.push("Riesgo de liquidez crítico (cobertura baja frente a salidas esperadas).");
  } else if (snapshot.risk_level === "high") {
    out.push("Riesgo de liquidez alto: margen de cobertura ajustado.");
  }
  return out;
}
