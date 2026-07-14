/**
 * Snapshot bancario canónico (FASE-3). Builder puro: se construye UNA vez y
 * expone totales por moneda separando operativo vs histórico.
 *
 * Reglas duras:
 *   - UYU y USD NUNCA se suman entre sí.
 *   - El `net` es neto bancario, NO es "caja".
 *   - No se doble cuenta entre fuentes: los duplicados cross-source (confianza
 *     exact/high) del legacy se excluyen de los totales y se marcan como diagnóstico.
 *   - Los históricos se separan; no contaminan los totales operativos.
 */
import {
  BANK_OPERATIONAL_START_DATE,
  isBankMovementHistorical,
} from "@/lib/bank/canonical/historical-policy";
import { detectCrossSourceDuplicates } from "@/lib/bank/canonical/dedup";
import type {
  CanonicalBankCurrency,
  CanonicalBankCurrencyBlock,
  CanonicalBankDiagnostic,
  CanonicalBankMovement,
  CanonicalBankSnapshot,
} from "@/lib/bank/canonical/types";

const CURRENCIES: CanonicalBankCurrency[] = ["UYU", "USD"];

function emptyBlock(currency: CanonicalBankCurrency): CanonicalBankCurrencyBlock {
  return {
    currency,
    operational: {
      inflows: 0,
      outflows: 0,
      net: 0,
      reconciledCount: 0,
      pendingCount: 0,
      movementCount: 0,
    },
    historical: { inflows: 0, outflows: 0, net: 0, movementCount: 0 },
  };
}

export interface BuildCanonicalBankSnapshotParams {
  movements: readonly CanonicalBankMovement[];
  /** Rango de referencia (informativo). Si falta, se deriva de los datos. */
  period?: { from?: string; to?: string };
  cutoff?: string;
  /** Diagnósticos ya acumulados por los adaptadores. */
  diagnostics?: readonly CanonicalBankDiagnostic[];
}

export function buildCanonicalBankSnapshot(
  params: BuildCanonicalBankSnapshotParams
): CanonicalBankSnapshot {
  const cutoff = (params.cutoff ?? BANK_OPERATIONAL_START_DATE).slice(0, 10);
  const diagnostics: CanonicalBankDiagnostic[] = [...(params.diagnostics ?? [])];

  // Duplicados cross-source: el registro legacy se excluye de totales (nunca doble contar).
  const dups = detectCrossSourceDuplicates(params.movements);
  const excludedLegacyIds = new Set<string>();
  for (const dup of dups) {
    if (dup.confidence === "exact" || dup.confidence === "high") {
      excludedLegacyIds.add(dup.legacy.canonicalId);
      diagnostics.push({
        code: "probable_cross_source_duplicate",
        source: dup.legacy.source,
        ref: dup.legacy.canonicalId,
        detail: `matches ${dup.canonical.canonicalId} (${dup.confidence})`,
      });
    }
  }

  const blocks = new Map<CanonicalBankCurrency, CanonicalBankCurrencyBlock>(
    CURRENCIES.map((c) => [c, emptyBlock(c)])
  );

  for (const movement of params.movements) {
    if (excludedLegacyIds.has(movement.canonicalId)) continue;
    const block = blocks.get(movement.currency);
    if (!block) continue; // moneda inválida ya diagnosticada por el adaptador

    const historical = isBankMovementHistorical(movement, cutoff);
    const signedTarget = historical ? block.historical : block.operational;

    if (movement.direction === "inflow") signedTarget.inflows += movement.amount;
    else signedTarget.outflows += movement.amount;
    signedTarget.net = signedTarget.inflows - signedTarget.outflows;
    signedTarget.movementCount += 1;

    if (!historical) {
      if (movement.isReconciled) block.operational.reconciledCount += 1;
      else block.operational.pendingCount += 1;
    }
  }

  const dates = params.movements
    .map((m) => m.movementDate)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();

  return {
    period: {
      from: params.period?.from ?? dates[0] ?? "",
      to: params.period?.to ?? dates[dates.length - 1] ?? "",
      cutoff,
    },
    byCurrency: CURRENCIES.map((c) => blocks.get(c)!),
    movements: [...params.movements],
    diagnostics,
  };
}
