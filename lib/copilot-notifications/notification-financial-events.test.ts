import { describe, expect, it } from "vitest";

import {
  buildClientDebtSettledDedupKey,
  buildDebtLifecycleStateMap,
  buildInvoiceOverdueDedupKey,
  buildNewDebtorDedupKey,
  buildPartialCollectionBody,
  resolveCollectionPaymentOutcome,
  resolveDebtLifecycleForClientCurrency,
  shouldNotifyNewDebtor,
} from "@/lib/copilot-notifications/notification-financial-events";

describe("buildNewDebtorDedupKey", () => {
  it("incluye workspace client_id currency y día", () => {
    expect(buildNewDebtorDedupKey("c1", "USD", "2026-06-10")).toBe(
      "new_debtor:c1:USD:2026-06-10"
    );
  });

  it("mismo día no duplica entre syncs", () => {
    const k1 = buildNewDebtorDedupKey("c1", "UYU", "2026-06-10");
    const k2 = buildNewDebtorDedupKey("c1", "UYU", "2026-06-10");
    expect(k1).toBe(k2);
  });
});

describe("resolveCollectionPaymentOutcome", () => {
  it("saldo > 0 → partial", () => {
    expect(resolveCollectionPaymentOutcome(1500)).toBe("partial");
  });

  it("saldo = 0 → settled", () => {
    expect(resolveCollectionPaymentOutcome(0)).toBe("settled");
  });
});

describe("buildPartialCollectionBody", () => {
  it("genera copy de cobro parcial", () => {
    expect(buildPartialCollectionBody("ACME", 5000, "UYU", 12000)).toBe(
      "ACME hizo un pago parcial."
    );
  });
});

describe("shouldNotifyNewDebtor", () => {
  it("nueva deuda con actividad reciente genera evento", () => {
    expect(
      shouldNotifyNewDebtor({
        totalBalance: 1000,
        hasRecentInvoiceActivity: true,
        lifecycle: { lastEventType: null },
      })
    ).toBe(true);
  });

  it("deuda en curso no re-notifica", () => {
    expect(
      shouldNotifyNewDebtor({
        totalBalance: 1000,
        hasRecentInvoiceActivity: true,
        lifecycle: { lastEventType: "new_debtor" },
      })
    ).toBe(false);
  });

  it("re-emerge tras saldado genera new_debtor", () => {
    expect(
      shouldNotifyNewDebtor({
        totalBalance: 800,
        hasRecentInvoiceActivity: false,
        lifecycle: { lastEventType: "client_debt_settled" },
      })
    ).toBe(true);
  });

  it("sin balance no genera", () => {
    expect(
      shouldNotifyNewDebtor({
        totalBalance: 0,
        hasRecentInvoiceActivity: true,
        lifecycle: { lastEventType: null },
      })
    ).toBe(false);
  });
});

describe("buildInvoiceOverdueDedupKey", () => {
  it("prioriza invoice_id", () => {
    expect(buildInvoiceOverdueDedupKey("inv-1", "c1", "UYU", "2026-05-01")).toBe(
      "invoice_overdue:inv-1"
    );
  });

  it("fallback sin invoice_id", () => {
    expect(buildInvoiceOverdueDedupKey(null, "c1", "USD", "2026-05-01")).toBe(
      "invoice_overdue:c1:USD:2026-05-01"
    );
  });

  it("misma factura no duplica", () => {
    const k1 = buildInvoiceOverdueDedupKey("inv-9", "c1", "UYU", "2026-05-01");
    const k2 = buildInvoiceOverdueDedupKey("inv-9", "c1", "UYU", "2026-05-01");
    expect(k1).toBe(k2);
  });
});

describe("buildDebtLifecycleStateMap", () => {
  it("conserva el evento más reciente por cliente+moneda", () => {
    const map = buildDebtLifecycleStateMap([
      {
        type: "new_debtor",
        dedup_key: buildNewDebtorDedupKey("c1", "UYU", "2026-06-01"),
        created_at: "2026-06-01T10:00:00Z",
        metadata: { client_id: "c1", currency: "UYU" },
      },
      {
        type: "client_debt_settled",
        dedup_key: buildClientDebtSettledDedupKey("c1", "2026-06-05"),
        created_at: "2026-06-05T10:00:00Z",
        metadata: { client_id: "c1" },
      },
    ]);

    expect(map.get("c1:UYU")?.lastEventType).toBe("new_debtor");
    expect(map.get("c1")?.lastEventType).toBe("client_debt_settled");
  });
});

describe("resolveDebtLifecycleForClientCurrency", () => {
  it("saldado reciente a nivel cliente prevalece sobre new_debtor viejo", () => {
    const map = buildDebtLifecycleStateMap([
      {
        type: "new_debtor",
        dedup_key: buildNewDebtorDedupKey("c1", "UYU", "2026-06-01"),
        created_at: "2026-06-01T10:00:00Z",
        metadata: { client_id: "c1", currency: "UYU" },
      },
      {
        type: "client_debt_settled",
        dedup_key: buildClientDebtSettledDedupKey("c1", "2026-06-05"),
        created_at: "2026-06-05T10:00:00Z",
        metadata: { client_id: "c1" },
      },
    ]);

    expect(resolveDebtLifecycleForClientCurrency(map, "c1", "UYU")).toEqual({
      lastEventType: "client_debt_settled",
    });
  });
});
