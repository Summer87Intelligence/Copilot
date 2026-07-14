/**
 * Adaptador: `bank_movements` (fuente canónica) → CanonicalBankMovement.
 *
 * Reutiliza el tipo productivo `BankMovement`. No reimplementa parsers ni dedupe:
 * solo normaliza al contrato canónico y emite diagnósticos de calidad de dato.
 */
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";
import {
  isBankMovementDateHistorical,
  normalizeMovementDate,
} from "@/lib/bank/canonical/historical-policy";
import type {
  CanonicalBankCurrency,
  CanonicalBankDiagnostic,
  CanonicalBankMovement,
} from "@/lib/bank/canonical/types";

const SOURCE = "bank_movements" as const;

function coerceCurrency(value: unknown): CanonicalBankCurrency | null {
  return value === "UYU" || value === "USD" ? value : null;
}

/** Estados que representan una conciliación cerrada en la fuente canónica. */
function isReconciledStatus(status: string): boolean {
  return status === "matched";
}

export function toCanonicalFromBankMovement(row: BankMovement): {
  movement: CanonicalBankMovement;
  diagnostics: CanonicalBankDiagnostic[];
} {
  const diagnostics: CanonicalBankDiagnostic[] = [];
  const ref = `${SOURCE}:${row.id}`;

  const currency = coerceCurrency(row.currency);
  if (!currency) diagnostics.push({ code: "missing_currency", source: SOURCE, ref });

  const movementDate = normalizeMovementDate(row.movement_date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(movementDate)) {
    diagnostics.push({ code: "missing_movement_date", source: SOURCE, ref });
  }

  const amount = typeof row.amount === "number" ? Math.abs(row.amount) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    diagnostics.push({ code: "invalid_amount", source: SOURCE, ref });
  }

  if (!row.account_label && !row.bank_name) {
    diagnostics.push({ code: "missing_account", source: SOURCE, ref });
  }

  const isReconciled = isReconciledStatus(row.status);
  // Estado incoherente: marcado matched sin contraparte, o con contraparte sin matched.
  if (isReconciled && !row.matched_id) {
    diagnostics.push({ code: "conflicting_reconciliation_status", source: SOURCE, ref });
  }

  // Asociación de ingreso: la fuente la guarda en matched_type='client'.
  const matchedIncomeId = row.matched_type === "client" ? row.matched_id : null;

  const movement: CanonicalBankMovement = {
    canonicalId: ref,
    source: SOURCE,
    sourceId: row.id,
    workspaceId: row.workspace_id,
    accountId: row.account_label ?? null,
    movementDate,
    currency: currency ?? "UYU",
    amount: Number.isFinite(amount) ? amount : 0,
    direction: row.direction === "outflow" ? "outflow" : "inflow",
    description: row.description ?? null,
    reference: row.bank_reference ?? null,
    isHistorical: isBankMovementDateHistorical(movementDate),
    isReconciled,
    reconciliationStatus: row.status,
    matchedIncomeId,
    importedAt: row.created_at ?? null,
  };

  return { movement, diagnostics };
}
