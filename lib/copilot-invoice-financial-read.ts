/**
 * Lectura financiera por factura (puro; sin I/O).
 *
 * PR2: `balance_authoritative` sale **solo** de `proto_invoices.balance_amount` (persistido).
 * `invoice_financials` (mapa opcional) solo aporta diagnóstico en `reasons`, sin override silencioso.
 */

export const INVOICE_FINANCIAL_READ_EPS = 1.0;

export type InvoiceFinancialConfidence = "high" | "medium" | "low";

export type InvoiceFinancialReasonCode =
  | "ok"
  | "missing_total"
  | "balance_negative"
  | "balance_above_total"
  | "non_finite_balance"
  | "non_finite_total"
  | "paid_derived_not_applicable"
  | "invoice_financials_diverges_from_persisted";

export type ReadInvoiceFinancialInput = {
  invoiceId: string;
  /** `proto_invoices.balance_amount` (persistido / fila). */
  balancePersisted: unknown;
  /**
   * Total de factura; opcional (p. ej. snapshot solo trae saldo).
   * Si falta o no es válido, `paid_derived` queda en null.
   */
  totalAmount?: unknown;
  /**
   * Saldo desde `invoice_financials` (misma fuente que `fetchInvoiceFinancialBalanceMap`).
   * Solo control: si hay entrada y difiere del persistido, se registra en `reasons`.
   */
  balanceFromFinancialsMap?: Map<string, number>;
};

export type ReadInvoiceFinancialResult = {
  invoiceId: string;
  total_amount: number;
  balance_authoritative: number;
  paid_derived: number | null;
  confidence: InvoiceFinancialConfidence;
  reasons: InvoiceFinancialReasonCode[];
};

function numFromPersisted(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function num(v: unknown): number {
  if (v === null || v === undefined) return NaN;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function appendFinancialsControlReasons(
  reasons: InvoiceFinancialReasonCode[],
  input: ReadInvoiceFinancialInput,
  balanceAuthoritative: number
): void {
  const map = input.balanceFromFinancialsMap;
  if (!map || map.size === 0) return;
  const id = String(input.invoiceId ?? "").trim();
  if (!id || !map.has(id)) return;
  const viewVal = num(map.get(id));
  if (
    Number.isFinite(viewVal) &&
    Math.abs(viewVal - balanceAuthoritative) > INVOICE_FINANCIAL_READ_EPS
  ) {
    reasons.push("invoice_financials_diverges_from_persisted");
  }
}

/**
 * Vista financiera en memoria para una factura (puro; sin mutar BD).
 * El saldo mostrable/agregable es siempre el persistido normalizado; la vista solo diagnostica.
 */
export function readInvoiceFinancial(
  input: ReadInvoiceFinancialInput
): ReadInvoiceFinancialResult {
  const reasons: InvoiceFinancialReasonCode[] = [];
  const balance_authoritative = numFromPersisted(input.balancePersisted);
  const persistedRaw = num(input.balancePersisted);
  const total = input.totalAmount === undefined ? NaN : num(input.totalAmount);

  appendFinancialsControlReasons(reasons, input, balance_authoritative);

  const hasFinancialsDivergence = reasons.includes(
    "invoice_financials_diverges_from_persisted"
  );

  if (!Number.isFinite(total)) {
    reasons.push("non_finite_total", "missing_total", "paid_derived_not_applicable");
    return {
      invoiceId: input.invoiceId,
      total_amount: 0,
      balance_authoritative,
      paid_derived: null,
      confidence: hasFinancialsDivergence ? "medium" : "low",
      reasons,
    };
  }

  if (total <= 0) {
    reasons.push("missing_total", "paid_derived_not_applicable");
    return {
      invoiceId: input.invoiceId,
      total_amount: total,
      balance_authoritative,
      paid_derived: null,
      confidence: hasFinancialsDivergence ? "medium" : "low",
      reasons,
    };
  }

  if (!Number.isFinite(persistedRaw)) {
    reasons.push("non_finite_balance", "paid_derived_not_applicable");
    return {
      invoiceId: input.invoiceId,
      total_amount: total,
      balance_authoritative: 0,
      paid_derived: null,
      confidence: "low",
      reasons,
    };
  }

  if (balance_authoritative < -INVOICE_FINANCIAL_READ_EPS) {
    reasons.push("balance_negative", "paid_derived_not_applicable");
    return {
      invoiceId: input.invoiceId,
      total_amount: total,
      balance_authoritative,
      paid_derived: null,
      confidence: "low",
      reasons,
    };
  }

  if (balance_authoritative > total + INVOICE_FINANCIAL_READ_EPS) {
    reasons.push("balance_above_total", "paid_derived_not_applicable");
    return {
      invoiceId: input.invoiceId,
      total_amount: total,
      balance_authoritative,
      paid_derived: null,
      confidence: "low",
      reasons,
    };
  }

  const paid_derived = total - balance_authoritative;
  if (!Number.isFinite(paid_derived) || paid_derived < -INVOICE_FINANCIAL_READ_EPS) {
    reasons.push("paid_derived_not_applicable");
    return {
      invoiceId: input.invoiceId,
      total_amount: total,
      balance_authoritative,
      paid_derived: null,
      confidence: hasFinancialsDivergence ? "medium" : "low",
      reasons,
    };
  }

  reasons.push("ok");
  const confidence: InvoiceFinancialConfidence = hasFinancialsDivergence ? "medium" : "high";

  return {
    invoiceId: input.invoiceId,
    total_amount: total,
    balance_authoritative,
    paid_derived: Math.max(0, paid_derived),
    confidence,
    reasons,
  };
}
