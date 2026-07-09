/**
 * Normalización de montos del Excel consolidado Santander.
 * El export puede traer strings estilo US (3,548.00) o números JS (3.548) en UYU.
 */
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";
import { parseUruguayMoney } from "@/lib/treasury/santander-pdf-statement-parser";

function stripMoneyString(value: string): string {
  return value.trim().replace(/\s/g, "");
}

function parseUsdStyleMoneyString(value: string): number | null {
  const trimmed = stripMoneyString(value);
  if (!trimmed) return null;

  const negative = trimmed.startsWith("-") || trimmed.startsWith("(");
  const unsigned = trimmed.replace(/[()]/g, "").replace(/^-/, "");
  const normalized = unsigned.replace(/,/g, "");
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function parseUyuThousandsDotString(value: string): number | null {
  const trimmed = stripMoneyString(value);
  if (!/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(trimmed)) return null;
  const negative = trimmed.startsWith("-");
  const unsigned = trimmed.replace(/^-/, "").replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(unsigned);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function parseUyuExcelMoneyString(value: string): number | null {
  const uyThousands = parseUyuThousandsDotString(value);
  if (uyThousands != null) return uyThousands;

  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(stripMoneyString(value))) {
    return parseUsdStyleMoneyString(value);
  }

  const fallback = parseUruguayMoney(value);
  if (fallback == null) return null;

  const abs = Math.abs(fallback);
  if (abs > 0 && abs < 1000 && shouldScaleUyuJsNumber(abs)) {
    const scaled = Math.round(abs * 1000 * 100) / 100;
    return fallback < 0 ? -scaled : scaled;
  }

  return fallback;
}

export function shouldScaleUyuJsNumber(abs: number): boolean {
  if (abs >= 1000) return false;
  const fraction = abs.toString().split(".")[1];
  return fraction?.length === 3;
}

export function normalizeUyuExcelJsNumber(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 1000) return value;
  if (shouldScaleUyuJsNumber(abs)) {
    const scaled = Math.round(abs * 1000 * 100) / 100;
    return value < 0 ? -scaled : scaled;
  }
  return value;
}

export function normalizeSantanderExcelSignedAmount(
  value: unknown,
  currency: "UYU" | "USD"
): number | null {
  if (value == null || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    if (currency === "USD") return value;
    return normalizeUyuExcelJsNumber(value);
  }

  const str = String(value).trim();
  if (!str) return null;

  if (currency === "USD") {
    return parseUsdStyleMoneyString(str);
  }

  return parseUyuExcelMoneyString(str);
}

export function normalizeSantanderExcelAmount(
  value: unknown,
  currency: "UYU" | "USD"
): number | null {
  const signed = normalizeSantanderExcelSignedAmount(value, currency);
  if (signed == null) return null;
  return Math.abs(signed);
}

/**
 * Corrige montos ya persistidos con parser Excel antiguo (p. ej. amount=3.55, metadata.debit=3.548).
 */
export function resolveImportedBankMovementAmount(
  movement: Pick<BankMovement, "amount" | "currency" | "direction" | "metadata">
): number {
  const parser =
    movement.metadata && typeof movement.metadata.parser === "string" ? movement.metadata.parser : null;
  if (parser === "santander_excel_consolidated_v1") {
    const debit =
      movement.metadata && typeof movement.metadata.debit === "number" ? movement.metadata.debit : null;
    const credit =
      movement.metadata && typeof movement.metadata.credit === "number" ? movement.metadata.credit : null;
    const rawMeta = movement.direction === "outflow" ? debit ?? credit : credit ?? debit;
    if (rawMeta != null) {
      const normalized = normalizeSantanderExcelAmount(rawMeta, movement.currency as "UYU" | "USD");
      if (normalized != null) return normalized;
    }
  }
  const normalizedAmount = normalizeSantanderExcelAmount(movement.amount, movement.currency as "UYU" | "USD");
  return normalizedAmount ?? movement.amount;
}

