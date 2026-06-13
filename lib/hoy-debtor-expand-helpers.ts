/**
 * Helpers puros para el panel expandido de deudores en Hoy.
 * Sin React, sin imports de UI — testeable de forma aislada.
 */

import type { DebtorCollectionRow } from "@/lib/copilot-hoy-executive";

export type DebtorExpandData = {
  deudaTotalAmt: number;
  currency: "UYU" | "USD";
  deudaVencidaAmt: number | null;
  /** deudaTotal − deudaVencida. Puede ser 0 si toda la deuda está vencida. */
  deudaAlDia: number;
  hasOverdue: boolean;
  /** Días desde la factura vencida más antigua, o null si no hay vencimiento. */
  overdueDays: number | null;
  /** Mensaje de estado para mostrar en el panel expandido. */
  expandMessage: string;
  /** Acción sugerida al usuario. */
  accionSugerida: string;
};

export function buildDebtorExpandData(row: DebtorCollectionRow): DebtorExpandData {
  const vencidoAmt = row.vencido?.amount ?? 0;
  const deudaAlDia = row.deuda.amount - vencidoAmt;
  const hasOverdue = vencidoAmt > 0;
  const rawDays = row.overdueDays ?? 0;
  const overdueDays = hasOverdue && rawDays > 0 ? rawDays : null;

  return {
    deudaTotalAmt: row.deuda.amount,
    currency: row.currency,
    deudaVencidaAmt: hasOverdue ? vencidoAmt : null,
    deudaAlDia,
    hasOverdue,
    overdueDays,
    expandMessage: hasOverdue
      ? "Requiere seguimiento por deuda atrasada."
      : "Este cliente tiene saldo pendiente, pero todavía no venció.",
    accionSugerida: hasOverdue
      ? "Contactar por deuda atrasada. Revisar ficha si se necesita detalle por factura."
      : "Mantener seguimiento preventivo.",
  };
}

/** Formatea un monto con símbolo de moneda (sin código ISO). */
export function fmtDebtSymbol(amount: number, currency: "UYU" | "USD"): string {
  const n = amount.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  return currency === "USD" ? `U$S ${n}` : `$ ${n}`;
}
