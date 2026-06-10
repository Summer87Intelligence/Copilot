import { describe, expect, it } from "vitest";

import type { PanoramaCurrencySlice } from "@/lib/copilot-financial-panorama-model";
import {
  buildCashDetail,
  buildCreditNotesDetail,
  buildNetIncomeDetail,
} from "@/lib/copilot-financial-panorama-details";
import {
  resolveCollectedSemaphore,
  resolveCreditNotesSemaphore,
  resolveNetIncomeSemaphore,
  resolveOverdueSemaphore,
} from "@/lib/copilot-financial-panorama-semaphore";

function slice(partial: Partial<PanoramaCurrencySlice> & { code: "UYU" | "USD" }): PanoramaCurrencySlice {
  return {
    grossInvoiced: partial.grossInvoiced ?? 100_000,
    creditNotes: partial.creditNotes ?? 0,
    netIncome: partial.netIncome ?? 100_000,
    collectedApplied: partial.collectedApplied ?? 80_000,
    pending: partial.pending ?? 20_000,
    overdue: partial.overdue ?? 0,
    collectionRate: partial.collectionRate ?? 0.8,
    overdueRate: partial.overdueRate ?? 0,
    code: partial.code,
  };
}

describe("copilot-financial-panorama-semaphore", () => {
  it("vencido 0 => saludable", () => {
    expect(resolveOverdueSemaphore(slice({ code: "UYU", overdue: 0 })).level).toBe("healthy");
  });

  it("vencido >30% pendiente => crítico", () => {
    const sem = resolveOverdueSemaphore(
      slice({ code: "UYU", pending: 100, overdue: 40, overdueRate: 0.4 })
    );
    expect(sem.level).toBe("critical");
  });

  it("cobranza >=80% => saludable", () => {
    expect(resolveCollectedSemaphore(slice({ code: "UYU", collectionRate: 0.85 })).level).toBe(
      "healthy"
    );
  });

  it("cobranza <50% => crítico", () => {
    expect(resolveCollectedSemaphore(slice({ code: "UYU", collectionRate: 0.4 })).level).toBe(
      "critical"
    );
  });

  it("NC >25% bruto => crítico", () => {
    const sem = resolveCreditNotesSemaphore(
      slice({ code: "UYU", grossInvoiced: 100, creditNotes: 30 })
    );
    expect(sem.level).toBe("critical");
  });

  it("NC supera bruto => crítico en neto", () => {
    const sem = resolveNetIncomeSemaphore(
      slice({ code: "UYU", grossInvoiced: 50_000, creditNotes: 60_000, netIncome: 0 })
    );
    expect(sem.level).toBe("critical");
  });
});

describe("copilot-financial-panorama-details", () => {
  it("ventas detail muestra total de ventas", () => {
    const d = buildNetIncomeDetail(
      slice({ code: "UYU", grossInvoiced: 100_000, creditNotes: 8_662, netIncome: 91_338 })
    );
    expect(d.title).toContain("Ventas");
    expect(d.rows.some((r) => r.label === "Ventas")).toBe(true);
    expect(d.rows.some((r) => r.label === "Notas de crédito")).toBe(false);
  });

  it("caja muestra fuente Tesorería", () => {
    const d = buildCashDetail("UYU", {
      currency: "UYU",
      openingConfigured: true,
      openingBalance: 10_000,
      collectedFromClients: 5_000,
      manualIncome: 1_000,
      manualExpense: 500,
      adjustments: 0,
      transfersNet: 0,
      availableCash: 15_500,
      currentCash: 15_500,
      movementsCount: 3,
      lastMovement: null, lastIncome: null, lastExpense: null,
    });
    expect(d.sourceLabel).toContain("Tesorería");
    expect(d.cta?.href).toBe("/copilot/tesoreria");
    expect(d.explanation?.toLowerCase()).toContain("facturación");
  });

  it("notas de crédito no se etiquetan como caja", () => {
    const d = buildCreditNotesDetail(slice({ code: "UYU", creditNotes: 5_000, grossInvoiced: 50_000 }));
    expect(d.subtitle.toLowerCase()).toContain("no son caja");
    expect(d.sourceLabel).not.toContain("Tesorería");
  });
});
