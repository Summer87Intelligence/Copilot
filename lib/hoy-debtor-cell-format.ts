/**
 * FASE UI-TABLES-001 — Formato PURO de celdas de la tabla "Clientes con deuda" (Hoy).
 *
 * Extraído del componente para poder testear los 3 casos de negocio sin DOM:
 *  - Caso 1: todo atrasado (deuda == atrasado, días > 0).
 *  - Caso 2: sin atraso (atrasado = "—", sin días, sin badge "Atrasado").
 *  - Caso 3: atraso parcial (deuda > atrasado > 0).
 *
 * NO cambia ningún cálculo: solo decide la PRESENTACIÓN de celdas ya calculadas
 * aguas arriba (deuda/vencido/overdueDays/antiguedad/flags provienen del pulso
 * canónico). Moneda UYU/USD nunca se mezcla.
 */
import type { DebtorCollectionRow } from "@/lib/copilot-today-business-pulse";

/** True si la fila tiene importe atrasado (columna "Atrasado" muestra monto vs "—"). */
export function debtorHasOverdueAmount(row: DebtorCollectionRow): boolean {
  return (row.vencido?.amount ?? 0) > 0;
}

/** Texto de la celda "Días de atraso" (— cuando no hay atraso). */
export function formatDebtorDaysCell(row: DebtorCollectionRow): string {
  if (row.flags.hasOverdue && (row.overdueDays ?? 0) > 0) {
    return `${row.overdueDays} días`;
  }
  if (row.flags.hasOverdue) {
    return row.antiguedad;
  }
  return "—";
}

export type DebtorRiskBadge = "atrasado" | "critico" | "con-deuda";

/**
 * Estado de riesgo canónico de la fila (para badge). "atrasado" gana sobre
 * "+30 días"; sin atraso → "con-deuda" (no se muestra badge "Atrasado").
 * Lenguaje canónico: "atrasado" (nunca "vencido").
 */
export function debtorRiskBadge(row: DebtorCollectionRow): DebtorRiskBadge {
  if (debtorHasOverdueAmount(row)) return "atrasado";
  if (row.flags.critical30Share) return "critico";
  return "con-deuda";
}
