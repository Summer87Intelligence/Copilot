import { describe, expect, it } from "vitest";

import type { PaymentBehaviorInvoice, PaymentBehaviorReceipt } from "@/lib/payment-behavior/payment-behavior-engine";
import {
  buildClientPaymentProfiles,
  buildGlobalFallbacks,
  buildProjectionSummary,
  projectOpenInvoices,
  runPaymentBehaviorEngine,
} from "@/lib/payment-behavior/payment-behavior-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TODAY = "2026-06-11";

function inv(
  partial: Partial<PaymentBehaviorInvoice> & { invoiceId: string; clientId: string }
): PaymentBehaviorInvoice {
  return {
    clientName: partial.clientName ?? "Cliente",
    currency: partial.currency ?? "UYU",
    issueDate: partial.issueDate ?? "2026-01-01",
    dueDate: partial.dueDate ?? "2026-01-31",
    totalAmount: partial.totalAmount ?? 1000,
    balanceAmount: partial.balanceAmount ?? 0,
    isCreditNote: partial.isCreditNote ?? false,
    isVoided: partial.isVoided ?? false,
    ...partial,
  };
}

function rcpt(
  partial: Partial<PaymentBehaviorReceipt> & { receiptId: string; clientId: string }
): PaymentBehaviorReceipt {
  return {
    currency: partial.currency ?? "UYU",
    amount: partial.amount ?? 1000,
    receiptDate: partial.receiptDate ?? "2026-01-30",
    appliedInvoiceId: null,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// 1. Cliente estable: paga siempre a ~30 días
// ---------------------------------------------------------------------------

describe("1. cliente estable paga siempre a 30 días", () => {
  const CLIENT = "c-stable";
  // 5 paid invoices → confidence = high (threshold: MIN_PAID_FOR_HIGH = 5)
  const invoices: PaymentBehaviorInvoice[] = [
    inv({ invoiceId: "i1", clientId: CLIENT, issueDate: "2026-01-01", dueDate: "2026-01-31", totalAmount: 1000, balanceAmount: 0 }),
    inv({ invoiceId: "i2", clientId: CLIENT, issueDate: "2026-02-01", dueDate: "2026-03-02", totalAmount: 1000, balanceAmount: 0 }),
    inv({ invoiceId: "i3", clientId: CLIENT, issueDate: "2026-03-01", dueDate: "2026-03-31", totalAmount: 1000, balanceAmount: 0 }),
    inv({ invoiceId: "i4", clientId: CLIENT, issueDate: "2026-04-01", dueDate: "2026-04-30", totalAmount: 1000, balanceAmount: 0 }),
    inv({ invoiceId: "i5", clientId: CLIENT, issueDate: "2026-04-15", dueDate: "2026-05-15", totalAmount: 800, balanceAmount: 0 }),
    inv({ invoiceId: "i6", clientId: CLIENT, issueDate: "2026-05-01", dueDate: "2026-05-31", totalAmount: 1500, balanceAmount: 1500 }),
  ];
  const receipts: PaymentBehaviorReceipt[] = [
    rcpt({ receiptId: "r1", clientId: CLIENT, amount: 1000, receiptDate: "2026-01-31" }),
    rcpt({ receiptId: "r2", clientId: CLIENT, amount: 1000, receiptDate: "2026-03-02" }),
    rcpt({ receiptId: "r3", clientId: CLIENT, amount: 1000, receiptDate: "2026-03-31" }),
    rcpt({ receiptId: "r4", clientId: CLIENT, amount: 1000, receiptDate: "2026-04-30" }),
    rcpt({ receiptId: "r5", clientId: CLIENT, amount: 800, receiptDate: "2026-05-15" }),
  ];

  it("debería tener confidence=high y paymentRegularity=stable", () => {
    const profiles = buildClientPaymentProfiles(invoices, receipts, TODAY);
    const profile = profiles.get(`${CLIENT}::UYU`);
    expect(profile).toBeDefined();
    expect(profile!.paidInvoices).toBe(5);
    expect(profile!.confidence).toBe("high");
    expect(profile!.paymentRegularity).toBe("stable");
  });

  it("la factura abierta proyecta una fecha a ~30 días de emisión", () => {
    const profiles = buildClientPaymentProfiles(invoices, receipts, TODAY);
    const fallbacks = buildGlobalFallbacks(invoices, receipts, TODAY);
    const open = invoices.filter((i) => i.balanceAmount > 0);
    const projections = projectOpenInvoices(open, profiles, fallbacks, TODAY);
    expect(projections).toHaveLength(1);
    const p = projections[0]!;
    expect(p.predictedPaymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.predictedPaymentDate >= TODAY).toBe(true);
    expect(p.confidence).toBe("high");
  });
});

// ---------------------------------------------------------------------------
// 2. Cliente irregular: usa mediana/p75, no promedio inflado
// ---------------------------------------------------------------------------

describe("2. cliente irregular: usa mediana/p75, no promedio inflado", () => {
  const CLIENT = "c-irregular";
  // Payments: 10, 10, 10, 90 days — mean 30, median 10
  const invoices: PaymentBehaviorInvoice[] = [
    inv({ invoiceId: "j1", clientId: CLIENT, issueDate: "2026-01-01", totalAmount: 500, balanceAmount: 0 }),
    inv({ invoiceId: "j2", clientId: CLIENT, issueDate: "2026-02-01", totalAmount: 500, balanceAmount: 0 }),
    inv({ invoiceId: "j3", clientId: CLIENT, issueDate: "2026-03-01", totalAmount: 500, balanceAmount: 0 }),
    inv({ invoiceId: "j4", clientId: CLIENT, issueDate: "2026-04-01", totalAmount: 500, balanceAmount: 0 }),
    inv({ invoiceId: "j5", clientId: CLIENT, issueDate: "2026-05-01", totalAmount: 500, balanceAmount: 500 }),
  ];
  const receipts: PaymentBehaviorReceipt[] = [
    rcpt({ receiptId: "s1", clientId: CLIENT, amount: 500, receiptDate: "2026-01-11" }),
    rcpt({ receiptId: "s2", clientId: CLIENT, amount: 500, receiptDate: "2026-02-11" }),
    rcpt({ receiptId: "s3", clientId: CLIENT, amount: 500, receiptDate: "2026-03-11" }),
    rcpt({ receiptId: "s4", clientId: CLIENT, amount: 500, receiptDate: "2026-07-01" }), // outlier: 91 days
  ];

  it("medianDaysToPay debería estar más cerca de 10 que de 50 (no se infla por outlier)", () => {
    const profiles = buildClientPaymentProfiles(invoices, receipts, TODAY);
    const profile = profiles.get(`${CLIENT}::UYU`);
    expect(profile).toBeDefined();
    expect(profile!.medianDaysToPay).toBeLessThan(30);
  });

  it("medianDaysToPay usa mediana, no promedio simple (no se infla por outlier de 91d)", () => {
    const profiles = buildClientPaymentProfiles(invoices, receipts, TODAY);
    const profile = profiles.get(`${CLIENT}::UYU`);
    expect(profile).toBeDefined();
    // median of [10, 10, 10, 91] = 10, mean ≈ 30
    // Engine should use medianDaysToPay for projection (not avg)
    expect(profile!.medianDaysToPay).toBeLessThan(20);
    // predictedDate >= today (even if median from issue_date falls in past)
    const profiles2 = buildClientPaymentProfiles(invoices, receipts, TODAY);
    const fallbacks = buildGlobalFallbacks(invoices, receipts, TODAY);
    const open = invoices.filter((i) => i.balanceAmount > 0);
    const projections = projectOpenInvoices(open, profiles2, fallbacks, TODAY);
    expect(projections).toHaveLength(1);
    expect(projections[0]!.predictedPaymentDate >= TODAY).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Cliente sin historial usa fallback global con low confidence
// ---------------------------------------------------------------------------

describe("3. cliente sin historial usa fallback global", () => {
  const CLIENT_WITH_HIST = "c-with-history";
  const CLIENT_NEW = "c-new";

  const invoices: PaymentBehaviorInvoice[] = [
    // Client with history (5 paid invoices)
    ...Array.from({ length: 5 }, (_, i) =>
      inv({
        invoiceId: `h${i}`,
        clientId: CLIENT_WITH_HIST,
        issueDate: `2026-0${i + 1}-01`,
        totalAmount: 1000,
        balanceAmount: 0,
      })
    ),
    // New client: no paid invoices
    inv({ invoiceId: "n1", clientId: CLIENT_NEW, issueDate: "2026-05-01", totalAmount: 800, balanceAmount: 800 }),
  ];
  const receipts: PaymentBehaviorReceipt[] = Array.from({ length: 5 }, (_, i) =>
    rcpt({
      receiptId: `hr${i}`,
      clientId: CLIENT_WITH_HIST,
      amount: 1000,
      receiptDate: `2026-0${i + 1}-30`,
    })
  );

  it("new client gets low/insufficient_data confidence", () => {
    const profiles = buildClientPaymentProfiles(invoices, receipts, TODAY);
    const fallbacks = buildGlobalFallbacks(invoices, receipts, TODAY);
    const open = invoices.filter((i) => i.balanceAmount > 0);
    const projections = projectOpenInvoices(open, profiles, fallbacks, TODAY);
    expect(projections).toHaveLength(1);
    const p = projections[0]!;
    expect(["low", "insufficient_data"]).toContain(p.confidence);
    expect(p.predictedPaymentDate >= TODAY).toBe(true);
  });

  it("projected date is still a valid future date", () => {
    const profiles = buildClientPaymentProfiles(invoices, receipts, TODAY);
    const fallbacks = buildGlobalFallbacks(invoices, receipts, TODAY);
    const open = invoices.filter((i) => i.balanceAmount > 0);
    const projections = projectOpenInvoices(open, profiles, fallbacks, TODAY);
    const p = projections[0]!;
    expect(p.predictedPaymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.predictedPaymentDate >= TODAY).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Factura parcial usa balanceAmount, no totalAmount
// ---------------------------------------------------------------------------

describe("4. factura parcial usa balanceAmount", () => {
  it("expectedAmount = balanceAmount cuando hay pago parcial", () => {
    const CLIENT = "c-partial";
    const invoices = [
      inv({ invoiceId: "p1", clientId: CLIENT, totalAmount: 5000, balanceAmount: 3500 }),
    ];
    const profiles = buildClientPaymentProfiles([], [], TODAY);
    const fallbacks = buildGlobalFallbacks([], [], TODAY);
    const projections = projectOpenInvoices(invoices, profiles, fallbacks, TODAY);
    expect(projections).toHaveLength(1);
    expect(projections[0]!.expectedAmount).toBe(3500);
  });
});

// ---------------------------------------------------------------------------
// 5. NC y anuladas no participan en el engine
// ---------------------------------------------------------------------------

describe("5. NC y anuladas no participan", () => {
  it("credit notes excluded from projections", () => {
    const invoices: PaymentBehaviorInvoice[] = [
      inv({ invoiceId: "nc1", clientId: "c1", totalAmount: 1000, balanceAmount: 1000, isCreditNote: true }),
      inv({ invoiceId: "ok1", clientId: "c1", totalAmount: 500, balanceAmount: 500 }),
    ];
    const result = runPaymentBehaviorEngine(invoices, [], TODAY);
    const projected = result.projections.find((p) => p.invoiceId === "nc1");
    expect(projected).toBeUndefined();
  });

  it("voided invoices excluded from projections", () => {
    const invoices: PaymentBehaviorInvoice[] = [
      inv({ invoiceId: "v1", clientId: "c1", totalAmount: 1000, balanceAmount: 1000, isVoided: true }),
      inv({ invoiceId: "ok2", clientId: "c1", totalAmount: 500, balanceAmount: 500 }),
    ];
    const result = runPaymentBehaviorEngine(invoices, [], TODAY);
    const projected = result.projections.find((p) => p.invoiceId === "v1");
    expect(projected).toBeUndefined();
  });

  it("NC excluded from client profiles (paidInvoices)", () => {
    const invoices: PaymentBehaviorInvoice[] = [
      inv({ invoiceId: "nc2", clientId: "c2", totalAmount: 200, balanceAmount: 0, isCreditNote: true }),
    ];
    const profiles = buildClientPaymentProfiles(invoices, [], TODAY);
    const profile = profiles.get("c2::UYU");
    if (profile) {
      expect(profile.totalInvoices).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. predictedPaymentDate nunca queda en el pasado
// ---------------------------------------------------------------------------

describe("6. predictedPaymentDate nunca en el pasado", () => {
  it("even for very old invoices, predicted date >= today", () => {
    const invoices: PaymentBehaviorInvoice[] = [
      inv({
        invoiceId: "old1",
        clientId: "c-old",
        issueDate: "2026-01-01",
        dueDate: "2026-01-31",
        totalAmount: 1000,
        balanceAmount: 800,
      }),
    ];
    const result = runPaymentBehaviorEngine(invoices, [], TODAY);
    for (const p of result.projections) {
      expect(p.predictedPaymentDate >= TODAY).toBe(true);
    }
  });

  it("overdue invoice still gets future predicted date", () => {
    const invoices: PaymentBehaviorInvoice[] = [
      inv({
        invoiceId: "over1",
        clientId: "c-over",
        issueDate: "2026-01-01",
        dueDate: "2026-02-01", // overdue
        totalAmount: 2000,
        balanceAmount: 2000,
      }),
    ];
    const result = runPaymentBehaviorEngine(invoices, [], TODAY);
    expect(result.projections[0]!.predictedPaymentDate >= TODAY).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Típico día de pago ajusta la fecha
// ---------------------------------------------------------------------------

describe("7. típico día de pago ajusta la fecha", () => {
  const CLIENT = "c-day15";
  // Client always pays on day 15
  const invoices: PaymentBehaviorInvoice[] = Array.from({ length: 5 }, (_, i) =>
    inv({
      invoiceId: `d${i}`,
      clientId: CLIENT,
      issueDate: `2026-0${i + 1}-01`,
      totalAmount: 1000,
      balanceAmount: i === 4 ? 1000 : 0,
    })
  );
  const receipts: PaymentBehaviorReceipt[] = Array.from({ length: 4 }, (_, i) =>
    rcpt({
      receiptId: `dr${i}`,
      clientId: CLIENT,
      amount: 1000,
      receiptDate: `2026-0${i + 1}-15`,
    })
  );

  it("typicalPaymentDayOfMonth should be 15", () => {
    const profiles = buildClientPaymentProfiles(invoices, receipts, TODAY);
    const profile = profiles.get(`${CLIENT}::UYU`);
    expect(profile?.typicalPaymentDayOfMonth).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// 8. Resumen next7/15/30 por moneda
// ---------------------------------------------------------------------------

describe("8. resumen next7/15/30 por moneda", () => {
  it("assigns amounts to correct windows", () => {
    const projections = [
      {
        invoiceId: "a", clientId: "c1", currency: "UYU" as const,
        predictedPaymentDate: "2026-06-15", // 4 days from today
        confidence: "high" as const, confidenceScore: 85,
        expectedAmount: 1000, expectedBucket: "0_7_days" as const, reason: "",
      },
      {
        invoiceId: "b", clientId: "c1", currency: "UYU" as const,
        predictedPaymentDate: "2026-06-22", // 11 days
        confidence: "medium" as const, confidenceScore: 60,
        expectedAmount: 2000, expectedBucket: "8_15_days" as const, reason: "",
      },
      {
        invoiceId: "c", clientId: "c2", currency: "UYU" as const,
        predictedPaymentDate: "2026-07-05", // 24 days
        confidence: "low" as const, confidenceScore: 30,
        expectedAmount: 500, expectedBucket: "16_30_days" as const, reason: "",
      },
    ];

    const summaries = buildProjectionSummary(projections, TODAY);
    const uyu = summaries.find((s) => s.currency === "UYU");
    expect(uyu).toBeDefined();
    expect(uyu!.next7Days).toBe(1000);
    expect(uyu!.next15Days).toBe(3000);
    expect(uyu!.next30Days).toBe(3500);
    expect(uyu!.over30Days).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. weightedExpected30d aplica pesos correctos
// ---------------------------------------------------------------------------

describe("9. weightedExpected30d aplica pesos de confianza", () => {
  it("high=0.9, medium=0.65, low=0.35, insufficient_data=0.2", () => {
    const projections = [
      {
        invoiceId: "w1", clientId: "c1", currency: "UYU" as const,
        predictedPaymentDate: "2026-06-20",
        confidence: "high" as const, confidenceScore: 85,
        expectedAmount: 1000, expectedBucket: "8_15_days" as const, reason: "",
      },
      {
        invoiceId: "w2", clientId: "c2", currency: "UYU" as const,
        predictedPaymentDate: "2026-06-25",
        confidence: "medium" as const, confidenceScore: 60,
        expectedAmount: 1000, expectedBucket: "16_30_days" as const, reason: "",
      },
      {
        invoiceId: "w3", clientId: "c3", currency: "UYU" as const,
        predictedPaymentDate: "2026-06-30",
        confidence: "low" as const, confidenceScore: 30,
        expectedAmount: 1000, expectedBucket: "16_30_days" as const, reason: "",
      },
      {
        invoiceId: "w4", clientId: "c4", currency: "UYU" as const,
        predictedPaymentDate: "2026-06-28",
        confidence: "insufficient_data" as const, confidenceScore: 15,
        expectedAmount: 1000, expectedBucket: "16_30_days" as const, reason: "",
      },
    ];

    const summaries = buildProjectionSummary(projections, TODAY);
    const uyu = summaries.find((s) => s.currency === "UYU");
    expect(uyu).toBeDefined();

    // Expected: 1000*0.9 + 1000*0.65 + 1000*0.35 + 1000*0.2 = 2100
    expect(uyu!.weightedExpected30d).toBeCloseTo(2100, 0);
    // Total = 4000
    expect(uyu!.totalExpected30d).toBe(4000);
    // Weighted < total (never inflated to 100%)
    expect(uyu!.weightedExpected30d).toBeLessThan(uyu!.totalExpected30d);
  });
});

// ---------------------------------------------------------------------------
// 10. USD y UYU calculados separados
// ---------------------------------------------------------------------------

describe("10. USD y UYU calculados por separado", () => {
  it("no contamination between currencies", () => {
    const CLIENT = "c-multi";
    const invoices: PaymentBehaviorInvoice[] = [
      inv({ invoiceId: "u1", clientId: CLIENT, currency: "UYU", totalAmount: 10000, balanceAmount: 10000 }),
      inv({ invoiceId: "d1", clientId: CLIENT, currency: "USD", totalAmount: 500, balanceAmount: 500 }),
    ];
    const result = runPaymentBehaviorEngine(invoices, [], TODAY);

    const yuSummary = result.summaries.find((s) => s.currency === "UYU");
    const usdSummary = result.summaries.find((s) => s.currency === "USD");

    expect(yuSummary).toBeDefined();
    expect(usdSummary).toBeDefined();
    // Each currency should only contain its own amounts
    expect(yuSummary!.next30Days + yuSummary!.over30Days).toBeGreaterThan(0);
    expect(usdSummary!.next30Days + usdSummary!.over30Days).toBeGreaterThan(0);
    // USD summary should NOT contain UYU amounts
    expect(usdSummary!.totalExpected30d + usdSummary!.over30Days).toBeLessThan(
      yuSummary!.totalExpected30d + yuSummary!.over30Days
    );
  });

  it("profile keyed separately per currency", () => {
    const CLIENT = "c-multi2";
    const invoices: PaymentBehaviorInvoice[] = [
      inv({ invoiceId: "u2", clientId: CLIENT, currency: "UYU", totalAmount: 5000, balanceAmount: 0 }),
      inv({ invoiceId: "d2", clientId: CLIENT, currency: "USD", totalAmount: 200, balanceAmount: 0 }),
    ];
    const receipts: PaymentBehaviorReceipt[] = [
      rcpt({ receiptId: "ru", clientId: CLIENT, currency: "UYU", amount: 5000, receiptDate: "2026-01-20" }),
      rcpt({ receiptId: "rd", clientId: CLIENT, currency: "USD", amount: 200, receiptDate: "2026-01-15" }),
    ];
    const profiles = buildClientPayerProfiles(invoices, receipts);
    const uyuProfile = profiles.get(`${CLIENT}::UYU`);
    const usdProfile = profiles.get(`${CLIENT}::USD`);
    expect(uyuProfile).toBeDefined();
    expect(usdProfile).toBeDefined();
    // Profiles should be independent
    expect(uyuProfile!.currency).toBe("UYU");
    expect(usdProfile!.currency).toBe("USD");
  });
});

// Helper alias used in test 10 to avoid re-exporting
function buildClientPayerProfiles(
  invoices: PaymentBehaviorInvoice[],
  receipts: PaymentBehaviorReceipt[]
) {
  return buildClientPaymentProfiles(invoices, receipts, TODAY);
}

// ---------------------------------------------------------------------------
// Integration: source mock + full pipeline
// ---------------------------------------------------------------------------

describe("Integration: full pipeline with mock data", () => {
  it("runs without error on empty data", () => {
    const result = runPaymentBehaviorEngine([], [], TODAY);
    expect(result.profiles.size).toBe(0);
    expect(result.projections).toHaveLength(0);
    expect(result.summaries).toHaveLength(0);
  });

  it("produces projections for open invoices only", () => {
    const invoices: PaymentBehaviorInvoice[] = [
      inv({ invoiceId: "x1", clientId: "cx", totalAmount: 1000, balanceAmount: 0 }),  // paid
      inv({ invoiceId: "x2", clientId: "cx", totalAmount: 1000, balanceAmount: 1000 }), // open
    ];
    const result = runPaymentBehaviorEngine(invoices, [], TODAY);
    expect(result.projections).toHaveLength(1);
    expect(result.projections[0]!.invoiceId).toBe("x2");
  });

  it("does not project when balance <= 0", () => {
    const invoices: PaymentBehaviorInvoice[] = [
      inv({ invoiceId: "z1", clientId: "cz", totalAmount: 500, balanceAmount: 0 }),
    ];
    const result = runPaymentBehaviorEngine(invoices, [], TODAY);
    expect(result.projections).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 11. Confianza se ajusta por regularidad
// ---------------------------------------------------------------------------

describe("11. confianza ajustada por regularidad", () => {
  // Bimodal pattern: Jan invoices paid in 2-3 days (fast receipts),
  // Jun invoices paid ~300 days later via Apr 2026 receipts (slow).
  // Last receipt: 2026-04-20 (52 days before today → no recency penalty).
  // CV >> 0.4 → irregular. 10 paid → base=high → irregular lowers to medium.
  const CLIENT_IRR = "c-irr-10";
  const irregularInvoices: PaymentBehaviorInvoice[] = [
    inv({ invoiceId: "ir01", clientId: CLIENT_IRR, issueDate: "2025-01-01", totalAmount: 1000, balanceAmount: 0 }),
    inv({ invoiceId: "ir02", clientId: CLIENT_IRR, issueDate: "2025-01-05", totalAmount: 1000, balanceAmount: 0 }),
    inv({ invoiceId: "ir03", clientId: CLIENT_IRR, issueDate: "2025-01-10", totalAmount: 1000, balanceAmount: 0 }),
    inv({ invoiceId: "ir04", clientId: CLIENT_IRR, issueDate: "2025-01-15", totalAmount: 1000, balanceAmount: 0 }),
    inv({ invoiceId: "ir05", clientId: CLIENT_IRR, issueDate: "2025-01-20", totalAmount: 1000, balanceAmount: 0 }),
    inv({ invoiceId: "ir06", clientId: CLIENT_IRR, issueDate: "2025-06-01", totalAmount: 1000, balanceAmount: 0 }),
    inv({ invoiceId: "ir07", clientId: CLIENT_IRR, issueDate: "2025-06-05", totalAmount: 1000, balanceAmount: 0 }),
    inv({ invoiceId: "ir08", clientId: CLIENT_IRR, issueDate: "2025-06-10", totalAmount: 1000, balanceAmount: 0 }),
    inv({ invoiceId: "ir09", clientId: CLIENT_IRR, issueDate: "2025-06-15", totalAmount: 1000, balanceAmount: 0 }),
    inv({ invoiceId: "ir10", clientId: CLIENT_IRR, issueDate: "2025-06-20", totalAmount: 1000, balanceAmount: 0 }),
    inv({ invoiceId: "ir11", clientId: CLIENT_IRR, issueDate: "2026-01-01", totalAmount: 1000, balanceAmount: 1000 }),
  ];
  const irregularReceipts: PaymentBehaviorReceipt[] = [
    // Fast: Jan invoices paid within 2-3 days
    rcpt({ receiptId: "rr01", clientId: CLIENT_IRR, amount: 1000, receiptDate: "2025-01-03" }),
    rcpt({ receiptId: "rr02", clientId: CLIENT_IRR, amount: 1000, receiptDate: "2025-01-08" }),
    rcpt({ receiptId: "rr03", clientId: CLIENT_IRR, amount: 1000, receiptDate: "2025-01-13" }),
    rcpt({ receiptId: "rr04", clientId: CLIENT_IRR, amount: 1000, receiptDate: "2025-01-18" }),
    rcpt({ receiptId: "rr05", clientId: CLIENT_IRR, amount: 1000, receiptDate: "2025-01-23" }),
    // Slow: Jun invoices paid ~300 days later (Apr 2026 — 52 days ago, no recency penalty)
    rcpt({ receiptId: "rr06", clientId: CLIENT_IRR, amount: 1000, receiptDate: "2026-04-01" }),
    rcpt({ receiptId: "rr07", clientId: CLIENT_IRR, amount: 1000, receiptDate: "2026-04-05" }),
    rcpt({ receiptId: "rr08", clientId: CLIENT_IRR, amount: 1000, receiptDate: "2026-04-10" }),
    rcpt({ receiptId: "rr09", clientId: CLIENT_IRR, amount: 1000, receiptDate: "2026-04-15" }),
    rcpt({ receiptId: "rr10", clientId: CLIENT_IRR, amount: 1000, receiptDate: "2026-04-20" }),
  ];

  it("10 facturas pagadas + irregular → confidence medium (no high)", () => {
    const profiles = buildClientPaymentProfiles(irregularInvoices, irregularReceipts, TODAY);
    const profile = profiles.get(`${CLIENT_IRR}::UYU`);
    expect(profile).toBeDefined();
    expect(profile!.paidInvoices).toBe(10);
    expect(profile!.paymentRegularity).toBe("irregular");
    expect(profile!.confidence).toBe("medium");
  });

  it("10 facturas pagadas + stable → confidence high", () => {
    // All invoices paid at exactly 29 days. Last receipt 2026-04-13 (59 days ago — no recency penalty).
    const CLIENT_ST = "c-stable-10";
    const invoices10: PaymentBehaviorInvoice[] = [
      inv({ invoiceId: "st0", clientId: CLIENT_ST, issueDate: "2025-07-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "st1", clientId: CLIENT_ST, issueDate: "2025-07-15", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "st2", clientId: CLIENT_ST, issueDate: "2025-08-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "st3", clientId: CLIENT_ST, issueDate: "2025-08-15", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "st4", clientId: CLIENT_ST, issueDate: "2025-09-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "st5", clientId: CLIENT_ST, issueDate: "2025-09-15", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "st6", clientId: CLIENT_ST, issueDate: "2025-10-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "st7", clientId: CLIENT_ST, issueDate: "2025-11-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "st8", clientId: CLIENT_ST, issueDate: "2025-12-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "st9", clientId: CLIENT_ST, issueDate: "2026-03-15", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "st10", clientId: CLIENT_ST, issueDate: "2026-06-09", totalAmount: 1000, balanceAmount: 1000 }),
    ];
    const receipts10: PaymentBehaviorReceipt[] = [
      rcpt({ receiptId: "sr0", clientId: CLIENT_ST, amount: 1000, receiptDate: "2025-07-30" }),
      rcpt({ receiptId: "sr1", clientId: CLIENT_ST, amount: 1000, receiptDate: "2025-08-13" }),
      rcpt({ receiptId: "sr2", clientId: CLIENT_ST, amount: 1000, receiptDate: "2025-08-30" }),
      rcpt({ receiptId: "sr3", clientId: CLIENT_ST, amount: 1000, receiptDate: "2025-09-13" }),
      rcpt({ receiptId: "sr4", clientId: CLIENT_ST, amount: 1000, receiptDate: "2025-09-30" }),
      rcpt({ receiptId: "sr5", clientId: CLIENT_ST, amount: 1000, receiptDate: "2025-10-14" }),
      rcpt({ receiptId: "sr6", clientId: CLIENT_ST, amount: 1000, receiptDate: "2025-10-30" }),
      rcpt({ receiptId: "sr7", clientId: CLIENT_ST, amount: 1000, receiptDate: "2025-11-30" }),
      rcpt({ receiptId: "sr8", clientId: CLIENT_ST, amount: 1000, receiptDate: "2025-12-30" }),
      rcpt({ receiptId: "sr9", clientId: CLIENT_ST, amount: 1000, receiptDate: "2026-04-13" }),
    ];
    const profiles = buildClientPaymentProfiles(invoices10, receipts10, TODAY);
    const profile = profiles.get(`${CLIENT_ST}::UYU`);
    expect(profile).toBeDefined();
    expect(profile!.paidInvoices).toBe(10);
    expect(profile!.paymentRegularity).toBe("stable");
    expect(profile!.confidence).toBe("high");
  });

  it("4 facturas pagadas + irregular → confidence low", () => {
    // 2 invoices paid fast (2-3 days), 2 invoices paid slow (61 days).
    // CV ≈ 0.92 → irregular. base = medium (4 ≥ 3). irregular → low.
    // Last receipt 2026-05-05 (37 days ago — no recency penalty).
    const CLIENT_4 = "c-irr-4";
    const invoices4: PaymentBehaviorInvoice[] = [
      inv({ invoiceId: "f1", clientId: CLIENT_4, issueDate: "2026-01-01", totalAmount: 500, balanceAmount: 0 }),
      inv({ invoiceId: "f2", clientId: CLIENT_4, issueDate: "2026-01-05", totalAmount: 500, balanceAmount: 0 }),
      inv({ invoiceId: "f3", clientId: CLIENT_4, issueDate: "2026-03-01", totalAmount: 500, balanceAmount: 0 }),
      inv({ invoiceId: "f4", clientId: CLIENT_4, issueDate: "2026-03-05", totalAmount: 500, balanceAmount: 0 }),
      inv({ invoiceId: "f5", clientId: CLIENT_4, issueDate: "2026-05-20", totalAmount: 500, balanceAmount: 500 }),
    ];
    const receipts4: PaymentBehaviorReceipt[] = [
      rcpt({ receiptId: "fr1", clientId: CLIENT_4, amount: 500, receiptDate: "2026-01-03" }),
      rcpt({ receiptId: "fr2", clientId: CLIENT_4, amount: 500, receiptDate: "2026-01-08" }),
      rcpt({ receiptId: "fr3", clientId: CLIENT_4, amount: 500, receiptDate: "2026-05-01" }),
      rcpt({ receiptId: "fr4", clientId: CLIENT_4, amount: 500, receiptDate: "2026-05-05" }),
    ];
    const profiles = buildClientPaymentProfiles(invoices4, receipts4, TODAY);
    const profile = profiles.get(`${CLIENT_4}::UYU`);
    expect(profile).toBeDefined();
    expect(profile!.paidInvoices).toBe(4);
    expect(profile!.paymentRegularity).toBe("irregular");
    expect(profile!.confidence).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// 12. Confianza se ajusta por recencia del último pago
// ---------------------------------------------------------------------------

describe("12. confianza ajustada por recencia", () => {
  // 5 paid invoices at stable 29-day cadence (Jan-May 2025).
  // An extra "orphan" receipt sets lastPaymentDate without affecting FIFO days.
  // base = high, stable = no regularity penalty. Only recency adjusts.
  function makeStableClientWithLastReceipt(clientId: string, lastReceiptDate: string): {
    invoices: PaymentBehaviorInvoice[];
    receipts: PaymentBehaviorReceipt[];
  } {
    const invoices: PaymentBehaviorInvoice[] = [
      inv({ invoiceId: `${clientId}-i1`, clientId, issueDate: "2025-01-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: `${clientId}-i2`, clientId, issueDate: "2025-02-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: `${clientId}-i3`, clientId, issueDate: "2025-03-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: `${clientId}-i4`, clientId, issueDate: "2025-04-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: `${clientId}-i5`, clientId, issueDate: "2025-05-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: `${clientId}-i6`, clientId, issueDate: "2026-06-01", totalAmount: 1000, balanceAmount: 1000 }),
    ];
    const receipts: PaymentBehaviorReceipt[] = [
      // 5 stable receipts at +29 days — FIFO consumes these for the 5 paid invoices
      rcpt({ receiptId: `${clientId}-r1`, clientId, amount: 1000, receiptDate: "2025-01-30" }),
      rcpt({ receiptId: `${clientId}-r2`, clientId, amount: 1000, receiptDate: "2025-03-02" }),
      rcpt({ receiptId: `${clientId}-r3`, clientId, amount: 1000, receiptDate: "2025-03-30" }),
      rcpt({ receiptId: `${clientId}-r4`, clientId, amount: 1000, receiptDate: "2025-04-30" }),
      rcpt({ receiptId: `${clientId}-r5`, clientId, amount: 1000, receiptDate: "2025-05-30" }),
      // Orphan receipt (unused by FIFO) — sets lastPaymentDate to the test date
      rcpt({ receiptId: `${clientId}-ro`, clientId, amount: 1000, receiptDate: lastReceiptDate }),
    ];
    return { invoices, receipts };
  }

  it("último pago hace >90 días baja confianza un nivel (high → medium)", () => {
    // 2026-03-01: 102 days before TODAY (2026-06-11). >90 but not >180 → lower once.
    const { invoices, receipts } = makeStableClientWithLastReceipt("c-rec90", "2026-03-01");
    const profiles = buildClientPaymentProfiles(invoices, receipts, TODAY);
    const profile = profiles.get("c-rec90::UYU");
    expect(profile).toBeDefined();
    expect(profile!.paymentRegularity).toBe("stable");
    expect(profile!.confidence).toBe("medium");
  });

  it("último pago hace >180 días baja confianza dos niveles (high → low)", () => {
    // 2025-12-01: 192 days before TODAY (2026-06-11). >180 → lower twice: high→medium→low.
    const { invoices, receipts } = makeStableClientWithLastReceipt("c-rec180", "2025-12-01");
    const profiles = buildClientPaymentProfiles(invoices, receipts, TODAY);
    const profile = profiles.get("c-rec180::UYU");
    expect(profile).toBeDefined();
    expect(profile!.paymentRegularity).toBe("stable");
    expect(profile!.confidence).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// 13. insufficient_data nunca supera low en proyecciones
// ---------------------------------------------------------------------------

describe("13. insufficient_data nunca supera low", () => {
  it("cliente con 0 facturas pagadas tiene insufficient_data en perfil", () => {
    const invoices: PaymentBehaviorInvoice[] = [
      inv({ invoiceId: "nd1", clientId: "c-nodata", issueDate: "2026-05-01", totalAmount: 1000, balanceAmount: 1000 }),
    ];
    const profiles = buildClientPaymentProfiles(invoices, [], TODAY);
    const profile = profiles.get("c-nodata::UYU");
    expect(profile).toBeDefined();
    expect(profile!.paidInvoices).toBe(0);
    expect(profile!.confidence).toBe("insufficient_data");
  });

  it("proyección de cliente sin historial tiene confianza low o insufficient_data (nunca medium/high)", () => {
    const invoices: PaymentBehaviorInvoice[] = [
      inv({ invoiceId: "nd2", clientId: "c-nodata2", issueDate: "2026-05-01", totalAmount: 1000, balanceAmount: 1000 }),
    ];
    const result = runPaymentBehaviorEngine(invoices, [], TODAY);
    const proj = result.projections[0];
    expect(proj).toBeDefined();
    expect(["low", "insufficient_data"]).toContain(proj!.confidence);
    expect(["medium", "high"]).not.toContain(proj!.confidence);
  });
});

// ---------------------------------------------------------------------------
// 14. weightedExpected30d refleja confianza ajustada
// ---------------------------------------------------------------------------

describe("14. weightedExpected30d baja cuando confidence baja por irregularidad", () => {
  it("cliente irregular (medium) produce menor peso que cliente estable (high) con mismo monto", () => {
    // ClientA: 10 paid, bimodal (Jan fast + Jun slow via Apr 2026 receipts) → irregular → medium
    // Last receipt 2026-04-20 (52 days ago — no recency penalty)
    const CLIENT_A = "c-weight-irr";
    const invoicesA: PaymentBehaviorInvoice[] = [
      inv({ invoiceId: "wa01", clientId: CLIENT_A, issueDate: "2025-01-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "wa02", clientId: CLIENT_A, issueDate: "2025-01-05", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "wa03", clientId: CLIENT_A, issueDate: "2025-01-10", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "wa04", clientId: CLIENT_A, issueDate: "2025-01-15", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "wa05", clientId: CLIENT_A, issueDate: "2025-01-20", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "wa06", clientId: CLIENT_A, issueDate: "2025-06-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "wa07", clientId: CLIENT_A, issueDate: "2025-06-05", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "wa08", clientId: CLIENT_A, issueDate: "2025-06-10", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "wa09", clientId: CLIENT_A, issueDate: "2025-06-15", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "wa10", clientId: CLIENT_A, issueDate: "2025-06-20", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "wa11", clientId: CLIENT_A, issueDate: "2026-06-09", totalAmount: 1000, balanceAmount: 1000 }),
    ];
    const receiptsA: PaymentBehaviorReceipt[] = [
      rcpt({ receiptId: "wra1", clientId: CLIENT_A, amount: 1000, receiptDate: "2025-01-03" }),
      rcpt({ receiptId: "wra2", clientId: CLIENT_A, amount: 1000, receiptDate: "2025-01-08" }),
      rcpt({ receiptId: "wra3", clientId: CLIENT_A, amount: 1000, receiptDate: "2025-01-13" }),
      rcpt({ receiptId: "wra4", clientId: CLIENT_A, amount: 1000, receiptDate: "2025-01-18" }),
      rcpt({ receiptId: "wra5", clientId: CLIENT_A, amount: 1000, receiptDate: "2025-01-23" }),
      // Apr 2026: recent enough (52 days ago), slow enough (>300 days from Jun 2025)
      rcpt({ receiptId: "wra6", clientId: CLIENT_A, amount: 1000, receiptDate: "2026-04-01" }),
      rcpt({ receiptId: "wra7", clientId: CLIENT_A, amount: 1000, receiptDate: "2026-04-05" }),
      rcpt({ receiptId: "wra8", clientId: CLIENT_A, amount: 1000, receiptDate: "2026-04-10" }),
      rcpt({ receiptId: "wra9", clientId: CLIENT_A, amount: 1000, receiptDate: "2026-04-15" }),
      rcpt({ receiptId: "wra0", clientId: CLIENT_A, amount: 1000, receiptDate: "2026-04-20" }),
    ];

    // ClientB: 5 paid, stable → confidence high → weight 0.90
    // Last receipt 2026-05-15 (27 days ago — no recency penalty)
    const CLIENT_B = "c-weight-stable";
    const invoicesB: PaymentBehaviorInvoice[] = [
      inv({ invoiceId: "wb1", clientId: CLIENT_B, issueDate: "2026-01-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "wb2", clientId: CLIENT_B, issueDate: "2026-02-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "wb3", clientId: CLIENT_B, issueDate: "2026-03-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "wb4", clientId: CLIENT_B, issueDate: "2026-04-01", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "wb5", clientId: CLIENT_B, issueDate: "2026-04-15", totalAmount: 1000, balanceAmount: 0 }),
      inv({ invoiceId: "wb6", clientId: CLIENT_B, issueDate: "2026-06-09", totalAmount: 1000, balanceAmount: 1000 }),
    ];
    const receiptsB: PaymentBehaviorReceipt[] = [
      rcpt({ receiptId: "wrb1", clientId: CLIENT_B, amount: 1000, receiptDate: "2026-01-31" }),
      rcpt({ receiptId: "wrb2", clientId: CLIENT_B, amount: 1000, receiptDate: "2026-03-02" }),
      rcpt({ receiptId: "wrb3", clientId: CLIENT_B, amount: 1000, receiptDate: "2026-03-31" }),
      rcpt({ receiptId: "wrb4", clientId: CLIENT_B, amount: 1000, receiptDate: "2026-04-30" }),
      rcpt({ receiptId: "wrb5", clientId: CLIENT_B, amount: 1000, receiptDate: "2026-05-15" }),
    ];

    const resultA = runPaymentBehaviorEngine(invoicesA, receiptsA, TODAY);
    const resultB = runPaymentBehaviorEngine(invoicesB, receiptsB, TODAY);

    const profileA = resultA.profiles.get(`${CLIENT_A}::UYU`);
    const profileB = resultB.profiles.get(`${CLIENT_B}::UYU`);
    expect(profileA!.confidence).toBe("medium");
    expect(profileB!.confidence).toBe("high");

    // Both clients have the same open amount ($1000), both projected within 30 days.
    // Medium weight (0.65) < high weight (0.90) → weightedExpected of A < B.
    const summaryA = resultA.summaries.find((s) => s.currency === "UYU");
    const summaryB = resultB.summaries.find((s) => s.currency === "UYU");
    expect(summaryA).toBeDefined();
    expect(summaryB).toBeDefined();
    expect(summaryA!.weightedExpected30d).toBeLessThan(summaryB!.weightedExpected30d);
  });
});
