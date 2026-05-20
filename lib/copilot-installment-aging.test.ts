import { describe, expect, it } from "vitest";

import {
  classifyInstallmentAgingRange,
  computeInstallmentAging,
  daysPastDueFromVencimiento,
  type InstallmentAgingInput,
} from "./copilot-installment-aging";

const NOW = "2026-05-15T12:00:00.000Z";

function row(
  overrides: Partial<InstallmentAgingInput> & { invoice_id: string }
): InstallmentAgingInput {
  return {
    currency_code: "UYU",
    cuota_saldo: 100,
    cuota_total: 100,
    cuota_vencimiento: "2026-05-20",
    ...overrides,
  };
}

describe("computeInstallmentAging", () => {
  it("empty → zeros y sin dominante", () => {
    const r = computeInstallmentAging([], NOW);
    expect(r.dominantRange).toBeNull();
    expect(r.hasMixedAging).toBe(false);
    expect(r.overdueInstallments).toBe(0);
    expect(r.overdueInvoices).toEqual([]);
    expect(r.byCurrency.UYU).toBeUndefined();
  });

  it("single installment vigente → current", () => {
    const r = computeInstallmentAging(
      [row({ invoice_id: "inv-1", cuota_vencimiento: "2026-06-01", cuota_saldo: 500 })],
      NOW
    );
    expect(r.byCurrency.UYU?.current).toBe(500);
    expect(r.byCurrency.UYU?.overdueTotal).toBe(0);
    expect(r.dominantRange).toBe("current");
    expect(r.overdueInvoices).toEqual([]);
  });

  it("single installment vencida → overdue_0_30", () => {
    const r = computeInstallmentAging(
      [row({ invoice_id: "inv-1", cuota_vencimiento: "2026-05-01", cuota_saldo: 300 })],
      NOW
    );
    expect(r.byCurrency.UYU?.overdue_0_30).toBe(300);
    expect(r.overdueInstallments).toBe(1);
    expect(r.overdueInvoices).toEqual(["inv-1"]);
    expect(r.dominantRange).toBe("overdue_0_30");
  });

  it("multiple installments misma factura — buckets separados", () => {
    const r = computeInstallmentAging(
      [
        row({ invoice_id: "inv-1", cuota_vencimiento: "2026-04-01", cuota_saldo: 100 }),
        row({ invoice_id: "inv-1", cuota_vencimiento: "2026-03-01", cuota_saldo: 200 }),
      ],
      NOW
    );
    expect(r.byCurrency.UYU?.overdue_31_60).toBe(100);
    expect(r.byCurrency.UYU?.overdue_61_90).toBe(200);
    expect(r.byCurrency.UYU?.pendingTotal).toBe(300);
    expect(r.overdueInstallments).toBe(2);
  });

  it("mixed overdue/current en misma factura → hasMixedAging", () => {
    const r = computeInstallmentAging(
      [
        row({ invoice_id: "inv-trap", cuota_vencimiento: "2026-04-01", cuota_saldo: 50 }),
        row({ invoice_id: "inv-trap", cuota_vencimiento: "2026-08-01", cuota_saldo: 2000 }),
      ],
      NOW
    );
    expect(r.hasMixedAging).toBe(true);
    expect(r.byCurrency.UYU?.current).toBe(2000);
    expect(r.byCurrency.UYU?.overdueTotal).toBe(50);
    expect(r.overdueInvoices).toEqual(["inv-trap"]);
  });

  it("min-date trap: futura no oculta vencida en totales", () => {
    const r = computeInstallmentAging(
      [
        row({ invoice_id: "inv-a", cuota_vencimiento: "2025-12-01", cuota_saldo: 368.26, currency_code: "USD" }),
        row({ invoice_id: "inv-a", cuota_vencimiento: "2026-09-01", cuota_saldo: 310, currency_code: "USD" }),
      ],
      NOW
    );
    expect(r.byCurrency.USD?.overdue_90_plus).toBe(368.26);
    expect(r.byCurrency.USD?.current).toBe(310);
    expect(r.dominantRange).toBe("overdue_90_plus");
    expect(r.hasMixedAging).toBe(true);
  });

  it("multi-moneda", () => {
    const r = computeInstallmentAging(
      [
        row({ invoice_id: "i-uyu", currency_code: "UYU", cuota_vencimiento: "2026-05-01", cuota_saldo: 1000 }),
        row({ invoice_id: "i-usd", currency_code: "USD", cuota_vencimiento: "2026-05-01", cuota_saldo: 50 }),
      ],
      NOW
    );
    expect(r.byCurrency.UYU?.overdue_0_30).toBe(1000);
    expect(r.byCurrency.USD?.overdue_0_30).toBe(50);
  });

  it("partial implícito: solo cuenta cuota_saldo", () => {
    const r = computeInstallmentAging(
      [
        row({
          invoice_id: "inv-p",
          cuota_total: 1000,
          cuota_saldo: 250,
          cuota_vencimiento: "2026-04-10",
        }),
      ],
      NOW
    );
    expect(r.byCurrency.UYU?.overdue_31_60).toBe(250);
    expect(r.byCurrency.UYU?.pendingTotal).toBe(250);
  });

  it("overdue spread 90+", () => {
    const r = computeInstallmentAging(
      [row({ invoice_id: "old", cuota_vencimiento: "2025-01-01", cuota_saldo: 999 })],
      NOW
    );
    expect(r.byCurrency.UYU?.overdue_90_plus).toBe(999);
    expect(r.dominantRange).toBe("overdue_90_plus");
  });

  it("dominant range elige bucket con mayor monto global", () => {
    const r = computeInstallmentAging(
      [
        row({ invoice_id: "a", cuota_vencimiento: "2026-05-10", cuota_saldo: 10 }),
        row({ invoice_id: "b", cuota_vencimiento: "2025-06-01", cuota_saldo: 5000 }),
      ],
      NOW
    );
    expect(r.dominantRange).toBe("overdue_90_plus");
  });

  it("ignora saldo 0 y moneda inválida", () => {
    const r = computeInstallmentAging(
      [
        row({ invoice_id: "z", cuota_saldo: 0, cuota_vencimiento: "2020-01-01" }),
        row({ invoice_id: "z2", currency_code: "EUR", cuota_saldo: 100, cuota_vencimiento: "2020-01-01" }),
      ],
      NOW
    );
    expect(r.byCurrency.UYU).toBeUndefined();
    expect(r.overdueInstallments).toBe(0);
  });

  it("malformed dates → current (no throw)", () => {
    const r = computeInstallmentAging(
      [row({ invoice_id: "bad", cuota_vencimiento: "not-a-date", cuota_saldo: 77 })],
      NOW
    );
    expect(r.byCurrency.UYU?.current).toBe(77);
    expect(r.overdueInstallments).toBe(0);
  });

  it("huérfana no entra en overdueInvoices", () => {
    const r = computeInstallmentAging(
      [
        {
          invoice_id: null,
          currency_code: "UYU",
          cuota_saldo: 100,
          cuota_vencimiento: "2025-01-01",
        },
      ],
      NOW
    );
    expect(r.overdueInstallments).toBe(0);
    expect(r.overdueInvoices).toEqual([]);
    expect(r.byCurrency.UYU?.overdue_90_plus).toBe(100);
  });
});

describe("daysPastDueFromVencimiento / classifyInstallmentAgingRange", () => {
  const nowMs = Date.parse(NOW);

  it("vencimiento hoy → 0 días (current)", () => {
    expect(daysPastDueFromVencimiento("2026-05-15", nowMs)).toBe(0);
    expect(classifyInstallmentAgingRange("2026-05-15", nowMs)).toBe("current");
  });

  it("fecha inválida → null / current", () => {
    expect(daysPastDueFromVencimiento("", nowMs)).toBeNull();
    expect(classifyInstallmentAgingRange("", nowMs)).toBe("current");
  });
});
