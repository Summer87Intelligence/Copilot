/**
 * FASE BANK-SCHEMA-CORRECTION-001 / MIGRATION-REVIEW-001 — Validación PURA de sumas.
 *
 * Espeja las reglas transaccionales de `confirm_bank_reconciliation_v1` para testear
 * sin Postgres. La verificación REAL (locks/concurrencia/actor) la hace la RPC; esto es
 * el CONTRATO de la lógica de sumas. Dinero en minor units (enteros).
 *
 * Reglas:
 *   link amount = p_applied_amount ?? importe del recibo ?? Σ allocations
 *   Σ allocations ≤ link amount            (permite SALDO SIN APLICAR)
 *   Σ links activos del movimiento + link ≤ importe del movimiento
 *   Σ links activos del recibo   + link ≤ importe del recibo
 *   por factura (AGREGADA): existentes activas + nuevas ≤ saldo, misma moneda, saldo > 0
 */

export type InvoiceAllocationInput = {
  invoiceId: string;
  amountMinor: number;            // suma NUEVA para esta factura (ya agregada)
  invoiceBalanceMinor: number;    // saldo (balance_amount)
  invoiceExistingAllocatedMinor?: number; // Σ allocations activas previas de la factura
  currency: "UYU" | "USD";
};

export type ConfirmationValidationInput = {
  movementCurrency: "UYU" | "USD";
  movementAmountMinor: number;
  movementUsedMinor: number;      // Σ links activos del movimiento
  receipt?: { amountMinor: number; usedMinor: number; currency: "UYU" | "USD" };
  allocations: InvoiceAllocationInput[];
  linkAmountMinor?: number;       // p_applied_amount explícito (opcional)
  toleranceMinor?: number;
};

export type ConfirmationValidationCode =
  | "INVALID_AMOUNT" | "INVALID_ALLOCATION" | "CURRENCY_MISMATCH"
  | "ALLOCATIONS_EXCEED_LINK" | "INVOICE_FULLY_PAID"
  | "OVER_APPLIED_MOVEMENT" | "OVER_APPLIED_RECEIPT" | "OVER_APPLIED_INVOICE";

export type ConfirmationValidationResult =
  | { ok: true; linkAmountMinor: number; allocatedMinor: number; unappliedMinor: number }
  | { ok: false; code: ConfirmationValidationCode };

export function validateConfirmation(input: ConfirmationValidationInput): ConfirmationValidationResult {
  const tol = input.toleranceMinor ?? 1;
  const allocSum = input.allocations.reduce((s, a) => s + a.amountMinor, 0);
  const linkAmount = input.linkAmountMinor ?? (input.receipt ? input.receipt.amountMinor : allocSum);

  if (!(linkAmount > 0)) return { ok: false, code: "INVALID_AMOUNT" };
  if (allocSum > linkAmount + tol) return { ok: false, code: "ALLOCATIONS_EXCEED_LINK" };

  if (input.receipt && input.receipt.currency !== input.movementCurrency) {
    return { ok: false, code: "CURRENCY_MISMATCH" };
  }
  for (const a of input.allocations) {
    if (!(a.amountMinor > 0)) return { ok: false, code: "INVALID_ALLOCATION" };
    if (a.currency !== input.movementCurrency) return { ok: false, code: "CURRENCY_MISMATCH" };
    if (a.invoiceBalanceMinor <= 0) return { ok: false, code: "INVOICE_FULLY_PAID" };
    const existing = a.invoiceExistingAllocatedMinor ?? 0;
    if (existing + a.amountMinor > a.invoiceBalanceMinor + tol) return { ok: false, code: "OVER_APPLIED_INVOICE" };
  }

  if (input.movementUsedMinor + linkAmount > input.movementAmountMinor + tol) {
    return { ok: false, code: "OVER_APPLIED_MOVEMENT" };
  }
  if (input.receipt && input.receipt.usedMinor + linkAmount > input.receipt.amountMinor + tol) {
    return { ok: false, code: "OVER_APPLIED_RECEIPT" };
  }

  return { ok: true, linkAmountMinor: linkAmount, allocatedMinor: allocSum, unappliedMinor: Math.max(0, linkAmount - allocSum) };
}
