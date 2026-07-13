import { describe, expect, it } from "vitest";

import {
  buildClient360Aging,
  sumAgingBuckets,
  sumLateBuckets,
} from "@/lib/copilot/client-360-aging";
import type { OperationalDebtInvoiceInput } from "@/lib/zeta/zeta-operational-debt-dedup";

const TODAY = "2026-07-13";

function inv(
  partial: Partial<OperationalDebtInvoiceInput> & { id: string }
): OperationalDebtInvoiceInput {
  return {
    company_id: "c1",
    currency_code: "UYU",
    total_amount: 1000,
    balance_amount: 1000,
    status: "issued",
    ...partial,
  };
}

describe("buildClient360Aging", () => {
  it("clasifica por due_date en el bucket correcto y separa monedas", () => {
    const aging = buildClient360Aging(
      [
        inv({ id: "1", due_date: "2026-07-20", balance_amount: 100 }), // futuro → on_time
        inv({ id: "2", due_date: "2026-07-10", balance_amount: 200 }), // 3 días → late_1_7
        inv({ id: "3", due_date: "2026-06-10", balance_amount: 300 }), // >30 → late_30_plus
        inv({ id: "4", currency_code: "USD", due_date: "2026-07-01", balance_amount: 50 }), // 12 días → late_8_14 USD
      ],
      { todayYmd: TODAY }
    );

    expect(aging.UYU.on_time).toBe(100);
    expect(aging.UYU.late_1_7).toBe(200);
    expect(aging.UYU.late_30_plus).toBe(300);
    expect(aging.USD.late_8_14).toBe(50);
    // UYU y USD nunca se mezclan
    expect(aging.USD.on_time).toBe(0);
    expect(aging.UYU.late_8_14).toBe(0);
  });

  it("factura sin due_date cae en on_time (no atrasada)", () => {
    const aging = buildClient360Aging([inv({ id: "1", due_date: null, balance_amount: 500 })], {
      todayYmd: TODAY,
    });
    expect(aging.UYU.on_time).toBe(500);
    expect(sumLateBuckets(aging.UYU)).toBe(0);
    expect(aging.lateInvoiceCount.UYU).toBe(0);
  });

  it("cuenta facturas con atraso por moneda", () => {
    const aging = buildClient360Aging(
      [
        inv({ id: "1", due_date: "2026-07-01", balance_amount: 100 }),
        inv({ id: "2", due_date: "2026-06-01", balance_amount: 100 }),
        inv({ id: "3", due_date: "2026-07-20", balance_amount: 100 }),
      ],
      { todayYmd: TODAY }
    );
    expect(aging.lateInvoiceCount.UYU).toBe(2);
  });

  it("ignora saldos cero", () => {
    const aging = buildClient360Aging([inv({ id: "1", due_date: "2026-06-01", balance_amount: 0 })], {
      todayYmd: TODAY,
    });
    expect(sumAgingBuckets(aging.UYU)).toBe(0);
  });

  it("sumAgingBuckets = total pendiente por moneda", () => {
    const aging = buildClient360Aging(
      [
        inv({ id: "1", due_date: "2026-07-20", balance_amount: 100 }),
        inv({ id: "2", due_date: "2026-07-10", balance_amount: 200 }),
      ],
      { todayYmd: TODAY }
    );
    expect(sumAgingBuckets(aging.UYU)).toBe(300);
    expect(sumLateBuckets(aging.UYU)).toBe(200);
  });
});
