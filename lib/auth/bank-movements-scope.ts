/**
 * FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001 —
 * Alcance de Banco independiente del email. Deriva de access_level efectivo.
 *
 * none | inflow_readonly | read_all | write_all
 */

import type { AccessLevel } from "@/lib/auth/module-permissions";

export const BANK_MOVEMENTS_SCOPES = ["none", "inflow_readonly", "read_all", "write_all"] as const;
export type BankMovementsScope = (typeof BANK_MOVEMENTS_SCOPES)[number];

export function bankMovementsScopeFromAccessLevel(level: AccessLevel | string | null | undefined): BankMovementsScope {
  const normalized = String(level ?? "none").trim().toLowerCase();
  if (normalized === "inflow_readonly") return "inflow_readonly";
  if (normalized === "read") return "read_all";
  if (normalized === "write" || normalized === "admin") return "write_all";
  return "none";
}

export function bankMovementsScopeLabel(scope: BankMovementsScope): string {
  switch (scope) {
    case "inflow_readonly":
      return "Solo ingresos · Solo lectura";
    case "read_all":
      return "Ver todos";
    case "write_all":
      return "Modificar";
    default:
      return "No ver";
  }
}

/** Lectura de listados/detalles (incluye inflow_readonly). */
export function canReadBankMovementsScope(scope: BankMovementsScope): boolean {
  return scope === "inflow_readonly" || scope === "read_all" || scope === "write_all";
}

/** Mutaciones del movimiento (editar/eliminar/ocultar/estado). No incluye identificar/vincular. */
export function canMutateBankMovementRecord(scope: BankMovementsScope): boolean {
  return scope === "write_all";
}

/** Fuerza direction=inflow en queries y UI. */
export function mustForceBankInflowOnly(scope: BankMovementsScope): boolean {
  return scope === "inflow_readonly";
}
