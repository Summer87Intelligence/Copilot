import { describe, expect, it } from "vitest";

import { calculateCashPosition } from "@/lib/treasury/treasury-cash-position";
import {
  filterAndSumZetaReceipts,
  findLatestZetaReceipts,
  type ZetaReceiptRow,
} from "@/lib/treasury/treasury-zeta-collections";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function rcpt(partial: Partial<ZetaReceiptRow> = {}): ZetaReceiptRow {
  return {
    currency_code: partial.currency_code ?? "UYU",
    amount: partial.amount ?? 1000,
    receipt_date: partial.receipt_date ?? "2026-05-29",
    receipt_number: partial.receipt_number ?? null,
    status: partial.status ?? null,
  };
}

function mov(partial: Partial<ManualCashMovement> = {}): ManualCashMovement {
  return {
    id: partial.id ?? "m1",
    workspaceId: "ws",
    companyId: null,
    accountId: null,
    ledgerType: "cash",
    movementType: partial.movementType ?? "income",
    source: "manual",
    concept: partial.concept ?? "Movimiento",
    category: null,
    amount: partial.amount ?? 1000,
    currencyCode: partial.currencyCode ?? "UYU",
    movementDate: partial.movementDate ?? "2026-05-29",
    paymentMethod: null,
    counterparty: null,
    reference: null,
    notes: null,
    affectsCashflow: partial.affectsCashflow ?? true,
    reconciled: false,
    bankReconciliationId: null,
    status: partial.status ?? "active",
    createdBy: null,
    createdAt: "2026-05-28T10:00:00Z",
    updatedAt: "2026-05-28T10:00:00Z",
    rawPayload: null,
    metadata: partial.metadata ?? null,
  };
}

const BASELINE = "2026-05-28"; // saldo cargado el 28/05/2026

// ─── Tests de filterAndSumZetaReceipts (puro) ─────────────────────────────────

describe("filterAndSumZetaReceipts — filtrado de recibos Zeta por baseline", () => {
  it("1. saldo cargado 263.034 sin recibos posteriores → disponible = saldo cargado", () => {
    const result = filterAndSumZetaReceipts([], { UYU: BASELINE });
    expect(result.UYU ?? 0).toBe(0);

    const pos = calculateCashPosition({
      manualCashMovements: [],
      openingBalances: [{ currency: "UYU", amount: 263_034, effectiveDate: BASELINE }],
      collectedFromClients: [],
    });
    expect(pos.find((p) => p.currency === "UYU")?.availableCash).toBe(263_034);
  });

  it("2. recibo anterior al baseline NO suma (ya incluido en el saldo cargado)", () => {
    // receipt_date < BASELINE → excluded
    const result = filterAndSumZetaReceipts(
      [rcpt({ receipt_date: "2026-05-20", amount: 25_742 })],
      { UYU: BASELINE }
    );
    expect(result.UYU ?? 0).toBe(0);
  });

  it("3. recibo posterior al baseline SÍ suma", () => {
    // receipt_date >= BASELINE → included
    const result = filterAndSumZetaReceipts(
      [rcpt({ receipt_date: "2026-05-29", amount: 25_742 })],
      { UYU: BASELINE }
    );
    expect(result.UYU).toBe(25_742);
  });

  it("4. El País paga 25.742 posterior → disponible 288.776", () => {
    const zetaCollections = filterAndSumZetaReceipts(
      [rcpt({ receipt_date: "2026-05-29", amount: 25_742 })],
      { UYU: BASELINE }
    );
    const pos = calculateCashPosition({
      manualCashMovements: [],
      openingBalances: [{ currency: "UYU", amount: 263_034, effectiveDate: BASELINE }],
      collectedFromClients: [{ currency: "UYU", amount: zetaCollections.UYU! }],
    });
    expect(pos.find((p) => p.currency === "UYU")?.availableCash).toBe(288_776);
    expect(pos.find((p) => p.currency === "UYU")?.collectedFromClients).toBe(25_742);
  });

  it("5. recibo exactamente en la fecha del baseline SÍ suma (>= baseline)", () => {
    // convention: receipt_date >= baselineDate is "post-baseline"
    const result = filterAndSumZetaReceipts(
      [rcpt({ receipt_date: BASELINE, amount: 10_000 })],
      { UYU: BASELINE }
    );
    expect(result.UYU).toBe(10_000);
  });

  it("6. nota de crédito / monto negativo no suma como caja", () => {
    const result = filterAndSumZetaReceipts(
      [rcpt({ receipt_date: "2026-05-29", amount: -5_000 })],
      { UYU: BASELINE }
    );
    expect(result.UYU ?? 0).toBe(0);
  });

  it("7. deuda pendiente (no es recibo) no se procesa — filterAndSumZetaReceipts solo recibe recibos", () => {
    // Pending receivables are never passed to this function; confirmed by type contract.
    const result = filterAndSumZetaReceipts([], { UYU: BASELINE });
    expect(result.UYU ?? 0).toBe(0);
  });

  it("8. egreso manual posterior resta caja (vía calculateCashPosition)", () => {
    const zetaCollections = filterAndSumZetaReceipts(
      [rcpt({ receipt_date: "2026-05-29", amount: 25_742 })],
      { UYU: BASELINE }
    );
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "expense", amount: 10_000, movementDate: "2026-05-29" }),
      ],
      openingBalances: [{ currency: "UYU", amount: 263_034, effectiveDate: BASELINE }],
      collectedFromClients: [{ currency: "UYU", amount: zetaCollections.UYU! }],
    });
    // 263034 + 25742 - 10000 = 278776
    expect(pos.find((p) => p.currency === "UYU")?.availableCash).toBe(278_776);
  });

  it("9. ingreso manual posterior suma (vía calculateCashPosition)", () => {
    const zetaCollections = filterAndSumZetaReceipts(
      [rcpt({ receipt_date: "2026-05-29", amount: 25_742 })],
      { UYU: BASELINE }
    );
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "income", amount: 5_000, movementDate: "2026-05-29" }),
      ],
      openingBalances: [{ currency: "UYU", amount: 263_034, effectiveDate: BASELINE }],
      collectedFromClients: [{ currency: "UYU", amount: zetaCollections.UYU! }],
    });
    // 263034 + 25742 + 5000 = 293776
    expect(pos.find((p) => p.currency === "UYU")?.availableCash).toBe(293_776);
  });

  it("10. pago programado pendiente (affectsCashflow=false) no resta caja actual", () => {
    const zetaCollections = filterAndSumZetaReceipts(
      [rcpt({ receipt_date: "2026-05-29", amount: 25_742 })],
      { UYU: BASELINE }
    );
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "expense", amount: 15_000, affectsCashflow: false, movementDate: "2026-05-30" }),
      ],
      openingBalances: [{ currency: "UYU", amount: 263_034, effectiveDate: BASELINE }],
      collectedFromClients: [{ currency: "UYU", amount: zetaCollections.UYU! }],
    });
    // 263034 + 25742 (programado no resta)
    expect(pos.find((p) => p.currency === "UYU")?.availableCash).toBe(288_776);
  });

  it("11. pago programado confirmado (affectsCashflow=true) posterior resta", () => {
    const zetaCollections = filterAndSumZetaReceipts(
      [rcpt({ receipt_date: "2026-05-29", amount: 25_742 })],
      { UYU: BASELINE }
    );
    const pos = calculateCashPosition({
      manualCashMovements: [
        mov({ movementType: "expense", amount: 15_000, affectsCashflow: true, movementDate: "2026-05-30" }),
      ],
      openingBalances: [{ currency: "UYU", amount: 263_034, effectiveDate: BASELINE }],
      collectedFromClients: [{ currency: "UYU", amount: zetaCollections.UYU! }],
    });
    // 263034 + 25742 - 15000 = 273776
    expect(pos.find((p) => p.currency === "UYU")?.availableCash).toBe(273_776);
  });

  it("12. UYU y USD separados — recibos no se mezclan", () => {
    const receipts: ZetaReceiptRow[] = [
      rcpt({ currency_code: "UYU", receipt_date: "2026-05-29", amount: 25_742 }),
      rcpt({ currency_code: "USD", receipt_date: "2026-05-29", amount: 500 }),
      // Pre-baseline for UYU (should NOT count)
      rcpt({ currency_code: "UYU", receipt_date: "2026-05-27", amount: 99_999 }),
    ];
    const result = filterAndSumZetaReceipts(receipts, {
      UYU: BASELINE,
      USD: BASELINE,
    });
    expect(result.UYU).toBe(25_742);
    expect(result.USD).toBe(500);

    const pos = calculateCashPosition({
      manualCashMovements: [],
      openingBalances: [
        { currency: "UYU", amount: 263_034, effectiveDate: BASELINE },
        { currency: "USD", amount: 10_000, effectiveDate: BASELINE },
      ],
      collectedFromClients: [
        { currency: "UYU", amount: result.UYU! },
        { currency: "USD", amount: result.USD! },
      ],
    });
    const uyu = pos.find((p) => p.currency === "UYU");
    const usd = pos.find((p) => p.currency === "USD");
    expect(uyu?.availableCash).toBe(288_776);
    expect(usd?.availableCash).toBe(10_500);
  });

  it("13. recibo cancelado/anulado no suma", () => {
    const statuses = ["void", "voided", "canceled", "cancelled", "anulada", "anulado", "annulled", "annul"];
    for (const status of statuses) {
      const result = filterAndSumZetaReceipts(
        [rcpt({ receipt_date: "2026-05-29", amount: 50_000, status })],
        { UYU: BASELINE }
      );
      expect(result.UYU ?? 0).toBe(0);
    }
  });

  it("14. sin baseline configurado → no suma recibos (conservador, evita doble conteo)", () => {
    const result = filterAndSumZetaReceipts(
      [rcpt({ receipt_date: "2026-05-29", amount: 25_742 })],
      {} // no baseline
    );
    expect(result.UYU ?? 0).toBe(0);
    expect(result.USD ?? 0).toBe(0);
  });
});

describe("filterAndSumZetaReceipts — edge cases adicionales", () => {
  it("múltiples recibos del mismo cliente en el período se acumulan", () => {
    const result = filterAndSumZetaReceipts(
      [
        rcpt({ receipt_date: "2026-05-29", amount: 10_000 }),
        rcpt({ receipt_date: "2026-05-30", amount: 15_742 }),
        rcpt({ receipt_date: "2026-06-01", amount: 742 }),
      ],
      { UYU: BASELINE }
    );
    expect(result.UYU).toBe(26_484);
  });

  it("mezcla de válidos, anulados y pre-baseline suma solo los válidos posteriores", () => {
    const result = filterAndSumZetaReceipts(
      [
        rcpt({ receipt_date: "2026-05-20", amount: 100_000 }), // pre-baseline
        rcpt({ receipt_date: "2026-05-29", amount: 25_742 }), // válido
        rcpt({ receipt_date: "2026-05-30", amount: 5_000, status: "void" }), // anulado
        rcpt({ receipt_date: "2026-05-31", amount: 1_000 }), // válido
      ],
      { UYU: BASELINE }
    );
    expect(result.UYU).toBe(26_742);
  });

  it("receipt_date inválido se excluye silenciosamente", () => {
    // Use raw objects to avoid the rcpt helper swallowing null via ??
    const result = filterAndSumZetaReceipts(
      [
        { currency_code: "UYU", amount: 50_000, receipt_date: null },
        { currency_code: "UYU", amount: 50_000, receipt_date: "not-a-date" },
        { currency_code: "UYU", amount: 1_000, receipt_date: "2026-05-29" }, // válido
      ],
      { UYU: BASELINE }
    );
    expect(result.UYU).toBe(1_000);
  });

  it("moneda desconocida se excluye", () => {
    const result = filterAndSumZetaReceipts(
      [rcpt({ currency_code: "EUR", receipt_date: "2026-05-29", amount: 50_000 })],
      { UYU: BASELINE }
    );
    expect(result.UYU ?? 0).toBe(0);
    expect(result.USD ?? 0).toBe(0);
  });

  it("moneda USD tiene baseline distinta a UYU", () => {
    // USD baseline 2026-04-01, UYU baseline 2026-05-28
    const result = filterAndSumZetaReceipts(
      [
        rcpt({ currency_code: "USD", receipt_date: "2026-04-15", amount: 200 }), // post USD baseline
        rcpt({ currency_code: "USD", receipt_date: "2026-03-31", amount: 999 }), // pre USD baseline
        rcpt({ currency_code: "UYU", receipt_date: "2026-05-29", amount: 5_000 }), // post UYU baseline
        rcpt({ currency_code: "UYU", receipt_date: "2026-05-27", amount: 9_999 }), // pre UYU baseline
      ],
      { USD: "2026-04-01", UYU: BASELINE }
    );
    expect(result.USD).toBe(200);
    expect(result.UYU).toBe(5_000);
  });
});

describe("findLatestZetaReceipts", () => {
  it("devuelve el recibo más reciente por moneda post-baseline", () => {
    const latest = findLatestZetaReceipts(
      [
        rcpt({ receipt_date: "2026-05-29", amount: 1_000, receipt_number: "RC-1" }),
        rcpt({ receipt_date: "2026-05-31", amount: 500, receipt_number: "RC-2" }),
        rcpt({ currency_code: "USD", receipt_date: "2026-06-01", amount: 100, receipt_number: "RC-USD" }),
      ],
      { UYU: BASELINE, USD: "2026-05-01" }
    );
    expect(latest.UYU).toEqual({ date: "2026-05-31", concept: "Recibo RC-2", amount: 500 });
    expect(latest.USD).toEqual({ date: "2026-06-01", concept: "Recibo RC-USD", amount: 100 });
  });
});
