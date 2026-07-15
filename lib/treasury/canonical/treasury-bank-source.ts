import type { SupabaseClient } from "@supabase/supabase-js";

import { bankReconciliationMovementRepositoryList } from "@/lib/treasury/repositories/bank-reconciliation-movement-repository";
import {
  toCanonicalFromLegacy,
  buildCanonicalBankSnapshot,
  type CanonicalBankMovement,
  type CanonicalBankSnapshot,
} from "@/lib/bank/canonical";
import type { BankReconciliationMovement } from "@/lib/treasury/treasury-types";

/**
 * PUNTO ÚNICO DE TRANSICIÓN LEGACY — Tesorería ↔ banco (FASE-4).
 *
 * Este módulo es el ÚNICO lugar donde la lógica de caja/proyección de Tesorería
 * lee `bank_reconciliation_movements`. Ningún servicio de caja debe importar el
 * repositorio legacy directamente: deben pasar por acá.
 *
 * Separación conceptual (ver docs/technical/treasury-canonical-migration.md):
 *   - Banco   = movimientos importados (capa canónica `bank_movements`). NO es caja.
 *   - Tesorería = posición y proyección de caja. NO es el extracto bancario.
 *
 * Compatibilidad: la proyección histórica cuenta ciertos movimientos bancarios
 * legacy en el cashflow (`shouldCountBankInCashflow`). Para preservar el resultado
 * EXACTO, este adaptador sigue devolviendo las filas legacy tal cual. El cambio es
 * de ORIGEN (una sola puerta encapsulada), no de RESULTADO.
 *
 * Retiro: cuando la proyección deje de mezclar banco en caja, este adaptador se
 * elimina junto con la dependencia legacy. Ver plan de retiro en la doc.
 */

export type TreasuryBankCashflowSource = {
  rows: BankReconciliationMovement[];
  error: { message?: string } | null;
};

/**
 * Fuente bancaria que alimenta el cashflow de Tesorería. Devuelve las filas legacy
 * sin transformar para mantener resultado idéntico. Única puerta de lectura.
 */
export async function loadTreasuryCashflowBankMovements(
  supabase: SupabaseClient,
  workspaceId: string,
  limit = 1000
): Promise<TreasuryBankCashflowSource> {
  const { rows, error } = await bankReconciliationMovementRepositoryList(
    supabase,
    workspaceId,
    {},
    limit
  );
  return { rows, error };
}

/**
 * Vista canónica de la fuente bancaria legacy de Tesorería (solo lectura /
 * observabilidad). Adapta las mismas filas legacy al contrato canónico bancario.
 * NO se suma a la caja: Banco y Caja permanecen separados. UYU/USD separados.
 */
export function buildTreasuryLegacyBankSnapshot(
  rows: readonly BankReconciliationMovement[],
  cutoff?: string
): CanonicalBankSnapshot {
  const movements: CanonicalBankMovement[] = [];
  const diagnostics = [];
  for (const row of rows) {
    const { movement, diagnostics: d } = toCanonicalFromLegacy(row);
    movements.push(movement);
    diagnostics.push(...d);
  }
  return buildCanonicalBankSnapshot({ movements, cutoff, diagnostics });
}
