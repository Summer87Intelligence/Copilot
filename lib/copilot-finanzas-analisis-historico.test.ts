import { describe, expect, it } from "vitest";

import {
  FINANZAS_ANALISIS_HISTORICO,
  METRIC_COMBINED_CURRENCY_DISCLAIMER,
} from "@/lib/copilot-financial-metrics-contract";
import { buildFinanzasCanonicalState } from "@/lib/copilot-finanzas-canonical-state";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";

function makeCashPosition(
  currency: "UYU" | "USD",
  availableCash: number
): CashPositionByCurrency {
  return {
    currency,
    openingConfigured: true,
    openingBalance: availableCash,
    collectedFromClients: 0,
    manualIncome: 0,
    manualExpense: 0,
    adjustments: 0,
    transfersNet: 0,
    availableCash,
    currentCash: availableCash,
    movementsCount: 0,
    lastMovement: null,
    lastIncome: null,
    lastExpense: null,
  };
}

describe("Análisis histórico section — copy contract", () => {
  it("renderiza título 'Análisis histórico'", () => {
    expect(FINANZAS_ANALISIS_HISTORICO.title).toBe("Análisis histórico");
  });

  it("disclaimer correcto — referencia a lectura histórica y caja operativa", () => {
    expect(FINANZAS_ANALISIS_HISTORICO.subtitle).toBe(METRIC_COMBINED_CURRENCY_DISCLAIMER);
    expect(FINANZAS_ANALISIS_HISTORICO.subtitle).toContain("histórica");
    expect(FINANZAS_ANALISIS_HISTORICO.subtitle).toContain("caja operativa");
  });

  it("disclaimer no dice 'UYU y USD se analizan por separado' (ese copy es del motor canónico)", () => {
    expect(FINANZAS_ANALISIS_HISTORICO.subtitle).not.toContain(
      "UYU y USD se analizan por separado"
    );
  });

  it("secciones canónicas siguen presentes — buildFinanzasCanonicalState devuelve datos por moneda", () => {
    const result = buildFinanzasCanonicalState({
      cashPositions: [makeCashPosition("UYU", 100_000), makeCashPosition("USD", 5_000)],
      treasurySummaries: [],
      portfolioRows: [{ debt_uyu: 20_000, debt_usd: 1_000 }],
    });
    expect(result.find((r) => r.currency === "UYU")).toBeDefined();
    expect(result.find((r) => r.currency === "USD")).toBeDefined();
    // confirms canonical engine is unaffected by the historical section refactor
    expect(result.find((r) => r.currency === "UYU")!.availableCash).toBe(100_000);
    expect(result.find((r) => r.currency === "USD")!.availableCash).toBe(5_000);
  });
});
