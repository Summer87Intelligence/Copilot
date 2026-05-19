/**
 * Helpers canónicos para derivar estado financiero de facturas Zeta.
 *
 * Reglas de negocio:
 *   balance <= EPSILON               → "paid"
 *   0 < balance < totalAmount        → "partial" (soportado en PROTO_INVOICE_STATUSES)
 *   balance >= totalAmount           → "issued"
 *
 * Statuses terminales (void/cancelled/anulada):
 *   NO convertir a issued/paid por saldo — el status en DB es autoridad.
 */

export const INVOICE_BALANCE_EPSILON = 1e-6;

/**
 * Statuses que indican que la factura fue anulada o cancelada definitivamente.
 * NO incluye "paid" — el pipeline SÍ puede cambiar una factura a paid.
 */
const TERMINAL_STATUSES = new Set([
  "void",
  "voided",
  "canceled",
  "cancelled",
  "anulada",
  "anulado",
  "annulled",
  "annul",
]);

/**
 * Devuelve true si el status indica que la factura está en estado terminal
 * (anulada/void/cancelled). El pipeline de saldos NO debe modificar estas facturas.
 */
export function isTerminalInvoiceStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status.trim().toLowerCase());
}

/**
 * Deriva el status financiero correcto a partir del saldo.
 *
 * @param balanceAmount - Saldo pendiente de la factura (de Zeta)
 * @param totalAmount   - Monto total de la factura (opcional; necesario para detectar "partial")
 * @returns "paid" | "partial" | "issued"
 */
export function deriveInvoiceFinancialStatusFromBalance({
  balanceAmount,
  totalAmount,
}: {
  balanceAmount: number;
  totalAmount?: number;
}): "paid" | "partial" | "issued" {
  if (balanceAmount <= INVOICE_BALANCE_EPSILON) return "paid";

  if (
    totalAmount !== undefined &&
    totalAmount > INVOICE_BALANCE_EPSILON &&
    balanceAmount < totalAmount - INVOICE_BALANCE_EPSILON
  ) {
    return "partial";
  }

  return "issued";
}
