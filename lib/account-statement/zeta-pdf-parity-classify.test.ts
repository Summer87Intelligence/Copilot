import { describe, expect, it } from "vitest";

import {
  classifyZetaPdfParity,
  derivedZetaFinalBalance,
} from "@/lib/account-statement/zeta-pdf-parity-classify";
import type { ZetaPdfClientStatement } from "@/lib/account-statement/parse-zeta-estado-cuenta-pdf-text";

function baseZeta(
  overrides: Partial<ZetaPdfClientStatement> = {}
): ZetaPdfClientStatement {
  return {
    codigo: "182",
    name: "Trexys",
    currency: "USD",
    openingBalance: 1171.2,
    finalBalance: -690.47,
    totalDebit: 1610.4,
    totalCredit: 2422.87,
    movementCount: 9,
    cfeCount: 4,
    receiptCount: 5,
    movements: [],
    parseWarnings: [],
    ...overrides,
  };
}

describe("derivedZetaFinalBalance", () => {
  it("Trexys 182 — saldo derivado 358,73 vs SALDO huérfano -690,47", () => {
    const zeta = baseZeta();
    expect(derivedZetaFinalBalance(zeta)).toBe(358.73);
  });
});

describe("classifyZetaPdfParity", () => {
  it("Trexys 182 — OK cuando Copilot coincide con saldo derivado", () => {
    const zeta = baseZeta();
    const status = classifyZetaPdfParity(zeta, {
      opening: 1171.2,
      totalDebit: 1610.4,
      totalCredit: 2422.87,
      finalBalance: 358.73,
    });
    expect(status).toBe("OK");
  });

  it("DIFF_FINAL si columnas OK pero saldo derivado tampoco coincide", () => {
    const zeta = baseZeta();
    const status = classifyZetaPdfParity(zeta, {
      opening: 1171.2,
      totalDebit: 1610.4,
      totalCredit: 2422.87,
      finalBalance: 999,
    });
    expect(status).toBe("DIFF_FINAL");
  });

  it("Dolby UYU — ROUNDING_OK por tolerancia en final parseado", () => {
    const zeta = baseZeta({
      codigo: "187",
      currency: "UYU",
      openingBalance: 0,
      totalDebit: 1.1,
      totalCredit: 0,
      finalBalance: 0.49,
    });
    const status = classifyZetaPdfParity(zeta, {
      opening: 0,
      totalDebit: 1.1,
      totalCredit: 0,
      finalBalance: 1.1,
    });
    expect(status).toBe("ROUNDING_OK");
  });
});
