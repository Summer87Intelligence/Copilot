/**
 * Adaptador: `bank_reconciliation_movements` (legacy Tesorería) → CanonicalBankMovement.
 *
 * Read-only durante la transición. NO se presenta como fuente bancaria operativa:
 * el snapshot la incluye marcada con `source` y sin doble contar contra la canónica.
 */
import type { BankReconciliationMovement } from "@/lib/treasury/treasury-types";
import {
  isBankMovementDateHistorical,
  normalizeMovementDate,
} from "@/lib/bank/canonical/historical-policy";
import type {
  CanonicalBankCurrency,
  CanonicalBankDiagnostic,
  CanonicalBankMovement,
} from "@/lib/bank/canonical/types";

const SOURCE = "bank_reconciliation_movements" as const;

function coerceCurrency(value: unknown): CanonicalBankCurrency | null {
  return value === "UYU" || value === "USD" ? value : null;
}

export function toCanonicalFromLegacy(row: BankReconciliationMovement): {
  movement: CanonicalBankMovement;
  diagnostics: CanonicalBankDiagnostic[];
} {
  const diagnostics: CanonicalBankDiagnostic[] = [];
  const ref = `${SOURCE}:${row.id}`;

  const currency = coerceCurrency(row.currencyCode);
  if (!currency) diagnostics.push({ code: "missing_currency", source: SOURCE, ref });

  const movementDate = normalizeMovementDate(row.movementDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(movementDate)) {
    diagnostics.push({ code: "missing_movement_date", source: SOURCE, ref });
  }

  const amount = typeof row.amount === "number" ? Math.abs(row.amount) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    diagnostics.push({ code: "invalid_amount", source: SOURCE, ref });
  }

  // Solo credit/debit son mapeables. Cualquier otra cosa es un registro no soportado.
  const direction =
    row.movementType === "credit" ? "inflow" : row.movementType === "debit" ? "outflow" : null;
  if (!direction) diagnostics.push({ code: "unsupported_legacy_record", source: SOURCE, ref });

  if (!row.accountId && !row.bankName) {
    diagnostics.push({ code: "missing_account", source: SOURCE, ref });
  }

  const movement: CanonicalBankMovement = {
    canonicalId: ref,
    source: SOURCE,
    sourceId: row.id,
    workspaceId: row.workspaceId,
    accountId: row.accountId ?? null,
    movementDate,
    currency: currency ?? "UYU",
    amount: Number.isFinite(amount) ? amount : 0,
    direction: direction ?? "inflow",
    description: row.description ?? null,
    reference: row.externalId ?? row.documentNumber ?? null,
    isHistorical: isBankMovementDateHistorical(movementDate),
    isReconciled: Boolean(row.matched),
    reconciliationStatus: row.matchStatus,
    matchedIncomeId: row.matchedSource === "zeta" ? row.matchedRecordId : null,
    importedAt: row.importedAt ?? null,
  };

  return { movement, diagnostics };
}
