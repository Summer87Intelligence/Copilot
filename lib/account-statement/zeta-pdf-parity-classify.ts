import type { ZetaPdfClientStatement } from "@/lib/account-statement/parse-zeta-estado-cuenta-pdf-text";

export type ZetaPdfParityAuditStatus =
  | "OK"
  | "ROUNDING_OK"
  | "DIFF_OPENING"
  | "DIFF_DEBE"
  | "DIFF_HABER"
  | "DIFF_FINAL"
  | "CLIENT_NOT_FOUND"
  | "PARSE_WARNING"
  | "DATA_GAP";

export type ZetaPdfParityCopilotTotals = {
  opening: number;
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
};

const AMOUNT_TOL = 0.02;
const ROUNDING_TOL_USD = 1.0;
const ROUNDING_TOL_UYU = 1.5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function near(a: number, b: number, tol = AMOUNT_TOL): boolean {
  return Math.abs(a - b) <= tol;
}

function roundingTolerance(currency: "UYU" | "USD"): number {
  return currency === "UYU" ? ROUNDING_TOL_UYU : ROUNDING_TOL_USD;
}

/** Saldo final coherente con totales de columna del PDF (opening + debe − haber). */
export function derivedZetaFinalBalance(zeta: ZetaPdfClientStatement): number {
  if (zeta.openingBalance == null) return 0;
  return round2(zeta.openingBalance + zeta.totalDebit - zeta.totalCredit);
}

/**
 * Clasifica paridad PDF Zeta vs totales Copilot.
 * Si el SALDO parseado del PDF contradice opening/debe/haber pero Copilot coincide
 * con el saldo derivado, se acepta OK (bloques huérfanos en PDF, p. ej. Trexys A614).
 */
export function classifyZetaPdfParity(
  zeta: ZetaPdfClientStatement,
  copilot: ZetaPdfParityCopilotTotals | null
): ZetaPdfParityAuditStatus {
  if (zeta.parseWarnings.includes("final_missing_used_last_running_balance")) {
    return "PARSE_WARNING";
  }

  if (!copilot) return "CLIENT_NOT_FOUND";

  if (zeta.openingBalance == null) return "PARSE_WARNING";

  const openingOk = near(zeta.openingBalance, copilot.opening);
  const debeOk = near(zeta.totalDebit, copilot.totalDebit);
  const haberOk = near(zeta.totalCredit, copilot.totalCredit);
  const finalOk =
    zeta.finalBalance != null && near(zeta.finalBalance, copilot.finalBalance);

  if (!openingOk) return "DIFF_OPENING";

  const tol = roundingTolerance(zeta.currency);
  const debeRound = !debeOk && near(zeta.totalDebit, copilot.totalDebit, tol);
  const haberRound = !haberOk && near(zeta.totalCredit, copilot.totalCredit, tol);
  const finalRound =
    zeta.finalBalance != null &&
    !finalOk &&
    near(zeta.finalBalance, copilot.finalBalance, tol);

  if (!debeOk && !debeRound) return "DIFF_DEBE";
  if (!haberOk && !haberRound) return "DIFF_HABER";

  if (zeta.finalBalance != null && !finalOk && !finalRound) {
    const columnTotalsOk =
      openingOk && (debeOk || debeRound) && (haberOk || haberRound);
    if (columnTotalsOk) {
      const derived = derivedZetaFinalBalance(zeta);
      if (near(derived, copilot.finalBalance)) return "OK";
      if (near(derived, copilot.finalBalance, tol)) return "ROUNDING_OK";
    }
    return "DIFF_FINAL";
  }

  if (debeRound || haberRound || finalRound) return "ROUNDING_OK";
  return "OK";
}
