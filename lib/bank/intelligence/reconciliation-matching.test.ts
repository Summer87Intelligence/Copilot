import { describe, it, expect } from "vitest";

import {
  matchBankMovement,
  type ReconciliationMatchInput,
  type NormalizedBankMovement,
} from "@/lib/bank/intelligence/reconciliation-matching";

const WS = "ws-A";
const PAYER = "fp-pepito";

function mov(o: Partial<NormalizedBankMovement> = {}): NormalizedBankMovement {
  return {
    id: "m1",
    workspaceId: WS,
    amountMinor: 100000, // 1000.00
    currency: "UYU",
    direction: "inflow",
    date: "2026-07-08",
    payerFingerprintHash: PAYER,
    normalizedPayerName: "pepito",
    ...o,
  };
}

function base(o: Partial<ReconciliationMatchInput> = {}): ReconciliationMatchInput {
  return {
    movement: mov(),
    clients: [{ clientId: "elpais", workspaceId: WS, normalizedName: "el pais" }],
    receipts: [],
    invoices: [],
    historicalLinks: [],
    ...o,
  };
}

const confirmedLink = { fingerprintHash: PAYER, clientId: "elpais", workspaceId: WS, status: "confirmed" as const, paymentsCount: 18 };

describe("matchBankMovement — 15 casos", () => {
  it("Caso 1 — cuenta confirmada + recibo exacto + importe/moneda → auto candidato", () => {
    const r = matchBankMovement(base({
      historicalLinks: [confirmedLink],
      receipts: [{ receiptId: "rc1", clientId: "elpais", workspaceId: WS, amountMinor: 100000, currency: "UYU", date: "2026-07-08" }],
    }));
    expect(r.clientId).toBe("elpais");
    expect(r.receiptId).toBe("rc1");
    expect(r.confidence).toBeGreaterThanOrEqual(95);
    expect(r.recommendedAction).toBe("AUTO_RECONCILE_CANDIDATE");
    expect(r.reasons).toEqual(expect.arrayContaining(["CONFIRMED_PAYER", "MATCHING_RECEIPT", "EXACT_AMOUNT", "DATE_PROXIMITY"]));
  });

  it("Caso 2 — nombre similar, cuenta desconocida, dos clientes → revisión, no auto", () => {
    const r = matchBankMovement(base({
      movement: mov({ payerFingerprintHash: "fp-unknown", normalizedPayerName: "grupo x" }),
      clients: [
        { clientId: "a", workspaceId: WS, normalizedName: "grupo x" },
        { clientId: "b", workspaceId: WS, normalizedName: "grupo x" },
      ],
    }));
    expect(r.recommendedAction).toBe("REVIEW");
    expect(r.warnings).toContain("MULTIPLE_STRONG_CANDIDATES");
    expect(r.clientId).toBeUndefined();
  });

  it("Caso 3 — movimiento exacto para una factura", () => {
    const r = matchBankMovement(base({
      historicalLinks: [confirmedLink],
      invoices: [{ invoiceId: "f1", clientId: "elpais", workspaceId: WS, currency: "UYU", outstandingMinor: 100000, date: "2026-07-01" }],
    }));
    expect(r.invoiceAllocations).toEqual([{ invoiceId: "f1", amountMinor: 100000 }]);
    expect(r.reasons).toContain("MATCHING_INVOICE");
  });

  it("Caso 4 — movimiento exacto = suma de dos facturas", () => {
    const r = matchBankMovement(base({
      historicalLinks: [confirmedLink],
      invoices: [
        { invoiceId: "f1", clientId: "elpais", workspaceId: WS, currency: "UYU", outstandingMinor: 60000, date: "2026-07-01" },
        { invoiceId: "f2", clientId: "elpais", workspaceId: WS, currency: "UYU", outstandingMinor: 40000, date: "2026-07-02" },
      ],
    }));
    const ids = r.invoiceAllocations.map((a) => a.invoiceId).sort();
    expect(ids).toEqual(["f1", "f2"]);
    expect(r.invoiceAllocations.reduce((s, a) => s + a.amountMinor, 0)).toBe(100000);
  });

  it("Caso 5 — pago parcial: aplica sin exceder el saldo, deja saldo sin aplicar", () => {
    const r = matchBankMovement(base({
      movement: mov({ amountMinor: 40000 }),
      historicalLinks: [confirmedLink],
      invoices: [{ invoiceId: "f1", clientId: "elpais", workspaceId: WS, currency: "UYU", outstandingMinor: 100000, date: "2026-07-01" }],
    }));
    expect(r.invoiceAllocations).toEqual([{ invoiceId: "f1", amountMinor: 40000 }]);
  });

  it("Caso 7 — pago sin factura: no marca factura arbitraria, saldo sin aplicar", () => {
    const r = matchBankMovement(base({ historicalLinks: [confirmedLink] }));
    expect(r.invoiceAllocations).toHaveLength(0);
    expect(r.warnings).toContain("UNAPPLIED_BALANCE");
    expect(r.clientId).toBe("elpais");
  });

  it("Caso 8 — diferencia de importe → AMOUNT_DIFFERENCE, revisión", () => {
    const r = matchBankMovement(base({
      movement: mov({ amountMinor: 95000 }),
      historicalLinks: [confirmedLink],
      receipts: [{ receiptId: "rc1", clientId: "elpais", workspaceId: WS, amountMinor: 100000, currency: "UYU", date: "2026-07-08" }],
    }));
    expect(r.warnings).toContain("AMOUNT_DIFFERENCE");
    expect(r.recommendedAction).not.toBe("AUTO_RECONCILE_CANDIDATE");
  });

  it("Caso 9 — moneda distinta → rechazo", () => {
    const r = matchBankMovement(base({
      historicalLinks: [confirmedLink],
      receipts: [{ receiptId: "rc1", clientId: "elpais", workspaceId: WS, amountMinor: 100000, currency: "USD", date: "2026-07-08" }],
    }));
    expect(r.recommendedAction).toBe("REJECT");
    expect(r.reasons).toContain("CURRENCY_MISMATCH");
  });

  it("Caso 10 — movimiento duplicado → rechazo", () => {
    const r = matchBankMovement(base({ movement: mov({ isProbableDuplicate: true }), historicalLinks: [confirmedLink] }));
    expect(r.recommendedAction).toBe("REJECT");
    expect(r.warnings).toContain("POSSIBLE_DUPLICATE");
  });

  it("Caso 11 — cuenta paga por varios clientes → exige más señales (no auto)", () => {
    const r = matchBankMovement(base({
      historicalLinks: [
        { ...confirmedLink, clientId: "elpais" },
        { ...confirmedLink, clientId: "otro" },
      ],
    }));
    expect(r.warnings).toContain("SHARED_PAYER");
    expect(r.recommendedAction).not.toBe("AUTO_RECONCILE_CANDIDATE");
  });

  it("Caso 12 — candidato en otro workspace → rechazo", () => {
    const r = matchBankMovement({
      movement: mov({ payerFingerprintHash: "fp-x", normalizedPayerName: "grupo x" }),
      clients: [{ clientId: "b", workspaceId: "ws-B", normalizedName: "grupo x" }],
      receipts: [{ receiptId: "rc-b", clientId: "b", workspaceId: "ws-B", amountMinor: 100000, currency: "UYU", date: "2026-07-08" }],
      invoices: [],
      historicalLinks: [],
    });
    expect(r.recommendedAction).toBe("REJECT");
    expect(r.warnings).toContain("WORKSPACE_MISMATCH");
  });

  it("Caso 13 — recibo ya conciliado → no se usa, advierte", () => {
    const r = matchBankMovement(base({
      historicalLinks: [confirmedLink],
      receipts: [{ receiptId: "rc1", clientId: "elpais", workspaceId: WS, amountMinor: 100000, currency: "UYU", date: "2026-07-08", alreadyReconciled: true }],
    }));
    expect(r.receiptId).toBeUndefined();
    expect(r.warnings).toContain("RECEIPT_ALREADY_RECONCILED");
  });

  it("Caso 14 — factura totalmente pagada → no aplica, advierte", () => {
    const r = matchBankMovement(base({
      historicalLinks: [confirmedLink],
      invoices: [{ invoiceId: "f1", clientId: "elpais", workspaceId: WS, currency: "UYU", outstandingMinor: 0, date: "2026-07-01" }],
    }));
    expect(r.invoiceAllocations).toHaveLength(0);
    expect(r.warnings).toContain("INVOICE_FULLY_PAID");
  });

  it("Caso 6/reverso/no comercial — egreso o revertido → sin identificar", () => {
    expect(matchBankMovement(base({ movement: mov({ direction: "outflow" }) })).warnings).toContain("NON_COMMERCIAL");
    expect(matchBankMovement(base({ movement: mov({ isReversed: true }) })).warnings).toContain("REVERSED_MOVEMENT");
  });

  it("Caso 15 — el motor es PURO (misma entrada → misma salida, sin mutar)", () => {
    const input = base({ historicalLinks: [confirmedLink], receipts: [{ receiptId: "rc1", clientId: "elpais", workspaceId: WS, amountMinor: 100000, currency: "UYU", date: "2026-07-08" }] });
    const snapshot = JSON.stringify(input);
    const a = matchBankMovement(input);
    const b = matchBankMovement(input);
    expect(a).toEqual(b);
    expect(JSON.stringify(input)).toBe(snapshot); // no mutó la entrada
  });
});
