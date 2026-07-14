/**
 * FINANCIAL CANONICAL LAYER — Helpers internos compartidos.
 *
 * Reglas de filtrado únicas para todos los builders. No exportar fuera de la
 * capa canónica: son detalles de implementación.
 */

import type { CanonicalInvoiceInput, CanonicalReceiptInput } from "./types";
import { normalizeCurrency, roundMoney } from "./currency";
import type { FinancialCurrency } from "./types";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

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

export function isVoided(status: string | null | undefined): boolean {
  if (!status) return false;
  return VOIDED_STATUSES.has(status.trim().toLowerCase());
}

export function isActiveRow(is_active: boolean | null | undefined): boolean {
  return is_active !== false;
}

/** Normaliza a `YYYY-MM-DD` o `null` si no es una fecha válida. */
export function ymd(value: string | null | undefined): string | null {
  if (value == null) return null;
  const d = String(value).slice(0, 10);
  return YMD_RE.test(d) ? d : null;
}

export function safeNum(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return v;
}

export function positiveAmount(v: number | null | undefined): number {
  return roundMoney(Math.max(0, safeNum(v)));
}

/** Saldo pendiente de una factura: `balance_amount` o, si es null, `total_amount`. */
export function pendingBalanceOf(inv: CanonicalInvoiceInput): number {
  const total = positiveAmount(inv.total_amount);
  if (inv.balance_amount == null) return total;
  return positiveAmount(inv.balance_amount);
}

export type NormalizedInvoice = {
  raw: CanonicalInvoiceInput;
  currency: FinancialCurrency;
  companyId: string | null;
  issueDate: string | null;
  dueDate: string | null;
  total: number;
  pending: number;
  isCreditNote: boolean;
};

/**
 * Clasifica una factura para su uso canónico. Devuelve `null` cuando la fila
 * debe excluirse por reglas duras (inactiva, anulada, sin moneda o sin monto),
 * y en `reason` el motivo para diagnósticos.
 */
export function classifyInvoice(inv: CanonicalInvoiceInput): {
  normalized: NormalizedInvoice | null;
  unknownCurrency: boolean;
} {
  if (!isActiveRow(inv.is_active) || isVoided(inv.status)) {
    return { normalized: null, unknownCurrency: false };
  }
  const total = positiveAmount(inv.total_amount);
  if (!(total > 0)) {
    return { normalized: null, unknownCurrency: false };
  }
  const currency = normalizeCurrency(inv.currency_code);
  if (currency === null) {
    return { normalized: null, unknownCurrency: true };
  }
  return {
    normalized: {
      raw: inv,
      currency,
      companyId: inv.company_id != null ? String(inv.company_id).trim() || null : null,
      issueDate: ymd(inv.issue_date),
      dueDate: ymd(inv.due_date),
      total,
      pending: pendingBalanceOf(inv),
      isCreditNote: inv.is_credit_note === true,
    },
    unknownCurrency: false,
  };
}

export type NormalizedReceipt = {
  currency: FinancialCurrency;
  receiptDate: string | null;
  amount: number;
};

export function classifyReceipt(rec: CanonicalReceiptInput): {
  normalized: NormalizedReceipt | null;
  unknownCurrency: boolean;
} {
  if (!isActiveRow(rec.is_active) || isVoided(rec.status)) {
    return { normalized: null, unknownCurrency: false };
  }
  const amount = positiveAmount(rec.amount);
  if (!(amount > 0)) {
    return { normalized: null, unknownCurrency: false };
  }
  const currency = normalizeCurrency(rec.currency_code);
  if (currency === null) {
    return { normalized: null, unknownCurrency: true };
  }
  return {
    normalized: { currency, receiptDate: ymd(rec.receipt_date), amount },
    unknownCurrency: false,
  };
}

/** `date` está dentro de `[from, to]` inclusive (comparación lexicográfica YMD). */
export function withinPeriod(
  date: string | null,
  from: string,
  to: string
): boolean {
  if (date === null) return false;
  return date >= from && date <= to;
}
