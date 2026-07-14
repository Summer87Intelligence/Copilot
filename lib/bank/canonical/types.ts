/**
 * Contrato canónico de movimientos bancarios (FASE-3).
 *
 * Fuente oficial: `bank_movements` (sistema operativo — importación Santander,
 * conciliación, ingresos, alias, dedupe). Fuente legacy: `bank_reconciliation_movements`
 * (histórico de Tesorería, read-only durante la transición).
 *
 * El importe se representa SIEMPRE como valor absoluto + `direction`. Nunca se usa
 * un importe con signo ambiguo. UYU y USD se mantienen separados en todo momento.
 */

export type CanonicalBankSource = "bank_movements" | "bank_reconciliation_movements";

export type CanonicalBankDirection = "inflow" | "outflow";

export type CanonicalBankCurrency = "UYU" | "USD";

export interface CanonicalBankMovement {
  /** Id estable e único cross-source: `${source}:${sourceId}`. */
  canonicalId: string;
  source: CanonicalBankSource;
  sourceId: string;
  workspaceId: string;
  accountId: string | null;
  /** YYYY-MM-DD (normalizada). */
  movementDate: string;
  currency: CanonicalBankCurrency;
  /** Valor absoluto (> 0 en datos válidos). El signo lo da `direction`. */
  amount: number;
  direction: CanonicalBankDirection;
  description: string | null;
  reference: string | null;
  /** Derivado de la política temporal, no persistido. */
  isHistorical: boolean;
  isReconciled: boolean;
  /** Estado de conciliación tal como lo expone la fuente. */
  reconciliationStatus: string;
  /** Id del ingreso/cliente asociado, si la fuente lo conserva. */
  matchedIncomeId: string | null;
  importedAt: string | null;
}

// ─── Diagnósticos ──────────────────────────────────────────────────────────────

export type CanonicalBankDiagnosticCode =
  | "missing_currency"
  | "missing_movement_date"
  | "invalid_amount"
  | "missing_account"
  | "probable_cross_source_duplicate"
  | "conflicting_reconciliation_status"
  | "unsupported_legacy_record"
  | "historical_operational_mismatch";

export interface CanonicalBankDiagnostic {
  code: CanonicalBankDiagnosticCode;
  source: CanonicalBankSource;
  /** Referencia NO sensible al registro (source + sourceId). Nunca descripción ni cuenta completa. */
  ref: string;
  detail?: string;
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

export interface CanonicalBankCurrencyBlock {
  currency: CanonicalBankCurrency;
  operational: {
    inflows: number;
    outflows: number;
    net: number;
    reconciledCount: number;
    pendingCount: number;
    movementCount: number;
  };
  historical: {
    inflows: number;
    outflows: number;
    net: number;
    movementCount: number;
  };
}

export interface CanonicalBankSnapshot {
  period: {
    from: string;
    to: string;
    /** BANK_OPERATIONAL_START_DATE aplicada. */
    cutoff: string;
  };
  byCurrency: CanonicalBankCurrencyBlock[];
  movements: CanonicalBankMovement[];
  diagnostics: CanonicalBankDiagnostic[];
}

// ─── Reporte bancario reusable ─────────────────────────────────────────────────

export interface BankActivityReportCurrencyRow {
  currency: CanonicalBankCurrency;
  operationalInflows: number;
  operationalOutflows: number;
  operationalNet: number;
  reconciledCount: number;
  pendingCount: number;
  historicalExcludedCount: number;
}

export interface BankActivityReportModel {
  cutoff: string;
  rows: BankActivityReportCurrencyRow[];
}
