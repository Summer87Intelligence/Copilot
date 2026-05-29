import { describe, expect, it } from "vitest";

import type { NormalizedCurrencyMetrics } from "@/lib/copilot-cartera-cards-source";
import {
  buildFinancialPanoramaModel,
  buildPanoramaCurrencySlice,
  safeRatio,
  shouldShowExpandedFiscalBlock,
} from "@/lib/copilot-financial-panorama-model";

function metrics(partial: Partial<NormalizedCurrencyMetrics> & { currencyCode: "UYU" | "USD" }): NormalizedCurrencyMetrics {
  return {
    currencyCode: partial.currencyCode,
    totalInvoiced: partial.totalInvoiced ?? partial.issuedInPeriod ?? 0,
    totalPending: partial.totalPending ?? partial.pendingAtCutoff ?? 0,
    totalCollected: partial.totalCollected ?? partial.portfolioResolvedAmount ?? 0,
    invoiceCount: partial.invoiceCount ?? 0,
    pendingInvoiceCount: partial.pendingInvoiceCount ?? 0,
    collectionEffectiveness: partial.collectionEffectiveness ?? null,
    issuedInPeriod: partial.issuedInPeriod ?? 100_000,
    pendingAtCutoff: partial.pendingAtCutoff ?? 20_000,
    collectedInPeriod: partial.collectedInPeriod ?? 0,
    collectedReceiptCount: partial.collectedReceiptCount ?? 0,
    openingBalance: partial.openingBalance ?? 0,
    creditNoteCount: partial.creditNoteCount ?? 0,
    creditNoteAmount: partial.creditNoteAmount ?? 0,
    issuedInPeriodNet: partial.issuedInPeriodNet ?? (partial.issuedInPeriod ?? 100_000) - (partial.creditNoteAmount ?? 0),
    previousPending: partial.previousPending ?? 0,
    portfolioResolvedAmount: partial.portfolioResolvedAmount ?? 75_000,
  };
}

describe("copilot-financial-panorama-model", () => {
  it("neto = bruto - notas de crédito", () => {
    const slice = buildPanoramaCurrencySlice(
      metrics({ currencyCode: "UYU", issuedInPeriod: 100_000, creditNoteAmount: 8_662, issuedInPeriodNet: 91_338 }),
      17_080
    );
    expect(slice.grossInvoiced).toBe(100_000);
    expect(slice.creditNotes).toBe(8_662);
    expect(slice.netIncome).toBe(91_338);
  });

  it("UYU/USD separados — no mezcla monedas en slices", () => {
    const model = buildFinancialPanoramaModel({
      periodLabel: "May 2026",
      metricsByCode: {
        UYU: metrics({ currencyCode: "UYU", issuedInPeriod: 50_000, pendingAtCutoff: 25_742 }),
        USD: metrics({ currencyCode: "USD", issuedInPeriod: 1_000, pendingAtCutoff: 500 }),
      },
      agingByCurrency: {
        UYU: [{ range: "31_60", amount: 17_080, invoiceCount: 1, clientCount: 1, percentage: 0.5, realDueDateCount: 1, syntheticDueDateCount: 0 }],
        USD: [{ range: "31_60", amount: 200, invoiceCount: 1, clientCount: 1, percentage: 0.4, realDueDateCount: 1, syntheticDueDateCount: 0 }],
      },
      snapshot: null,
      cashPositions: [
        { currency: "UYU", availableCash: 100, currentCash: 100, openingConfigured: true, openingBalance: 0, collectedFromClients: 0, manualIncome: 0, manualExpense: 0, adjustments: 0, transfersNet: 0, movementsCount: 0, lastMovement: null },
        { currency: "USD", availableCash: 50, currentCash: 50, openingConfigured: true, openingBalance: 0, collectedFromClients: 0, manualIncome: 0, manualExpense: 0, adjustments: 0, transfersNet: 0, movementsCount: 0, lastMovement: null },
      ],
      portfolioRows: [],
      fiscal: { upcomingCount: 0, overdueCount: 0, paidCount: 0, estimated30: 0, isEmpty: true },
    });
    expect(model.currencies).toHaveLength(2);
    expect(model.currencies[0]?.code).toBe("UYU");
    expect(model.currencies[1]?.code).toBe("USD");
  });

  it("tasa cobranza = cobrado / neto", () => {
    const slice = buildPanoramaCurrencySlice(
      metrics({ currencyCode: "UYU", issuedInPeriodNet: 100_000, portfolioResolvedAmount: 75_000 }),
      0
    );
    expect(slice.collectionRate).toBeCloseTo(0.75);
  });

  it("tasa vencido = vencido / pendiente", () => {
    const slice = buildPanoramaCurrencySlice(
      metrics({ currencyCode: "UYU", pendingAtCutoff: 25_742 }),
      17_080
    );
    expect(slice.overdueRate).toBeCloseTo(17_080 / 25_742, 4);
  });

  it("no divide por cero", () => {
    expect(safeRatio(10, 0)).toBeNull();
    const slice = buildPanoramaCurrencySlice(
      metrics({ currencyCode: "UYU", issuedInPeriodNet: 0, pendingAtCutoff: 0 }),
      0
    );
    expect(slice.collectionRate).toBeNull();
    expect(slice.overdueRate).toBeNull();
  });

  it("no muestra fiscal grande si todo está en 0", () => {
    expect(
      shouldShowExpandedFiscalBlock({
        upcomingCount: 0,
        overdueCount: 0,
        paidCount: 0,
        estimated30: 0,
        isEmpty: true,
      })
    ).toBe(false);
  });

  it("caja viene de tesorería, cartera de métricas", () => {
    const model = buildFinancialPanoramaModel({
      periodLabel: "test",
      metricsByCode: { UYU: metrics({ currencyCode: "UYU" }) },
      snapshot: null,
      cashPositions: [
        { currency: "UYU", availableCash: 262_479, currentCash: 262_479, openingConfigured: true, openingBalance: 0, collectedFromClients: 0, manualIncome: 0, manualExpense: 0, adjustments: 0, transfersNet: 0, movementsCount: 0, lastMovement: null },
      ],
      portfolioRows: [],
      fiscal: { upcomingCount: 0, overdueCount: 0, paidCount: 0, estimated30: 0, isEmpty: true },
    });
    expect(model.projection.cashTodayUyu).toBe(262_479);
    expect(model.currencies[0]?.pending).toBe(20_000);
  });
});
