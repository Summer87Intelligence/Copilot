/**
 * FASE BANK-SCHEMA-CORRECTION-001 — Validación PURA de sumas de conciliación.
 *
 * Espeja las reglas transaccionales de `confirm_bank_reconciliation_v1` para poder
 * testearlas sin Postgres. La verificación REAL (con locks/concurrencia) la hace la
 * RPC; esto es el CONTRATO de la lógica de sumas. Dinero en minor units (enteros).
 *
 * Reglas:
 *   Σ links activos del movimiento + nuevo ≤ importe del movimiento
 *   Σ links activos del recibo   + nuevo ≤ importe del recibo
 *   cada allocation ≤ saldo de su factura, misma moneda
 *   Σ allocations = importe del link (o link = importe del recibo si no hay allocations)
 */

export type ConfirmationValidationInput = {
  movementCurrency: "UYU" | "USD";
  movementAmountMinor: number;
  movementUsedMinor: number; // Σ links activos del movimiento
  receipt?: { amountMinor: number; usedMinor: number; currency: "UYU" | "USD" };
  allocations: Array<{ invoiceId: string; amountMinor: number; invoiceBalanceMinor: number; currency: "UYU" | "USD" }>;
  toleranceMinor?: number;
};

export type ConfirmationValidationResult =
  | { ok: true; linkAmountMinor: number; unappliedMinor: number }
  | { ok: false; code:
      | "INVALID_AMOUNT" | "INVALID_ALLOCATION" | "CURRENCY_MISMATCH"
      | "OVER_APPLIED_MOVEMENT" | "OVER_APPLIED_RECEIPT" | "OVER_APPLIED_INVOICE" };

export function validateConfirmation(input: ConfirmationValidationInput): ConfirmationValidationResult {
  const tol = input.toleranceMinor ?? 1;
  const allocSum = input.allocations.reduce((s, a) => s + a.amountMinor, 0);
  const linkAmount = allocSum > 0 ? allocSum : input.receipt ? input.receipt.amountMinor : 0;

  if (!(linkAmount > 0)) return { ok: false, code: "INVALID_AMOUNT" };

  if (input.receipt && input.receipt.currency !== input.movementCurrency) {
    return { ok: false, code: "CURRENCY_MISMATCH" };
  }
  for (const a of input.allocations) {
    if (!(a.amountMinor > 0)) return { ok: false, code: "INVALID_ALLOCATION" };
    if (a.currency !== input.movementCurrency) return { ok: false, code: "CURRENCY_MISMATCH" };
    if (a.amountMinor > a.invoiceBalanceMinor + tol) return { ok: false, code: "OVER_APPLIED_INVOICE" };
  }

  if (input.movementUsedMinor + linkAmount > input.movementAmountMinor + tol) {
    return { ok: false, code: "OVER_APPLIED_MOVEMENT" };
  }
  if (input.receipt && input.receipt.usedMinor + linkAmount > input.receipt.amountMinor + tol) {
    return { ok: false, code: "OVER_APPLIED_RECEIPT" };
  }

  return { ok: true, linkAmountMinor: linkAmount, unappliedMinor: Math.max(0, linkAmount - allocSum) };
}
