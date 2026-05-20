/**
 * Tests para buildAgingComparativeDiagnostics (ZETA-08 Fase 2).
 * Motor puro — sin I/O, sin mocks.
 */

import { describe, expect, it } from "vitest";

import {
  buildAgingComparativeDiagnostics,
  resolveAgingMode,
} from "@/lib/copilot-installment-aging-delta";
import { computeInstallmentAging } from "@/lib/copilot-installment-aging";
import type { AgingBucket } from "@/lib/copilot-financial-reconciliation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = "2026-05-20T00:00:00.000Z";

/** Cuota actual (vence en el futuro) */
function makeCurrent(amount: number, currency = "UYU") {
  return {
    invoice_id: "inv-1",
    currency_code: currency,
    cuota_saldo: amount,
    cuota_total: amount,
    cuota_vencimiento: "2026-06-01",
  };
}

/** Cuota vencida hace N días */
function makeOverdue(
  amount: number,
  daysAgo: number,
  invoiceId = "inv-1",
  currency = "UYU"
) {
  const d = new Date(Date.parse(NOW) - daysAgo * 86_400_000);
  return {
    invoice_id: invoiceId,
    currency_code: currency,
    cuota_saldo: amount,
    cuota_total: amount,
    cuota_vencimiento: d.toISOString().slice(0, 10),
  };
}

/** Genera agingByCurrency legacy con un solo bucket simple. */
function makeLegacyAging(
  currency: "UYU" | "USD",
  buckets: Partial<Record<string, number>>
): Partial<Record<"UYU" | "USD", AgingBucket[]>> {
  const ranges = ["0_30", "31_60", "61_90", "90_plus"] as const;
  const total = ranges.reduce((s, r) => s + (buckets[r] ?? 0), 0);
  return {
    [currency]: ranges.map((range) => ({
      range,
      amount: buckets[range] ?? 0,
      invoiceCount: buckets[range] ? 1 : 0,
      clientCount: buckets[range] ? 1 : 0,
      percentage: total > 0 ? ((buckets[range] ?? 0) / total) : 0,
      realDueDateCount: 0,
      syntheticDueDateCount: buckets[range] ? 1 : 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// resolveAgingMode
// ---------------------------------------------------------------------------

describe("resolveAgingMode", () => {
  it("retorna legacy por defecto", () => {
    expect(resolveAgingMode(undefined, null)).toBe("legacy");
  });

  it("query param tiene precedencia sobre env", () => {
    expect(resolveAgingMode("legacy", "installment_shadow")).toBe("installment_shadow");
  });

  it("acepta installment desde env", () => {
    expect(resolveAgingMode("installment", null)).toBe("installment");
  });

  it("valor desconocido cae a legacy", () => {
    expect(resolveAgingMode("unknown_value", null)).toBe("legacy");
  });
});

// ---------------------------------------------------------------------------
// Caso parity: installment y legacy tienen el mismo overdue
// ---------------------------------------------------------------------------

describe("buildAgingComparativeDiagnostics — parity", () => {
  it("diff=0 y recommendation=switch_ready cuando overdue coincide", () => {
    // Cuota vencida hace 40 días → overdue_31_60
    const installments = [makeOverdue(1000, 40)];
    const instResult = computeInstallmentAging(installments, NOW);

    // Legacy: mismo monto en 31_60
    const legacyAging = makeLegacyAging("UYU", { "31_60": 1000 });

    const diag = buildAgingComparativeDiagnostics(instResult, legacyAging, "installment_shadow");

    expect(diag.mode).toBe("installment_shadow");
    const delta = diag.installment_vs_legacy_delta.byCurrency.find((d) => d.currency === "UYU");
    expect(delta).toBeDefined();
    expect(delta!.diff).toBe(0);
    expect(delta!.underestimated).toBe(false);
    expect(delta!.hidden_overdue).toBe(0);
    expect(diag.installment_vs_legacy_delta.recommendation).toBe("switch_ready");
  });
});

// ---------------------------------------------------------------------------
// Delta positivo: installment detecta más overdue que legacy
// ---------------------------------------------------------------------------

describe("buildAgingComparativeDiagnostics — delta positivo", () => {
  it("hidden_overdue > 0 y underestimated=true cuando installment supera a legacy", () => {
    // Cuota vencida hace 20 días → overdue_0_30
    // Legacy no captura overdue_0_30 (su overdue empieza en 31+)
    const installments = [makeOverdue(500, 20)];
    const instResult = computeInstallmentAging(installments, NOW);

    // Legacy solo tiene monto en 0_30 (que NO cuenta como overdue en legacy)
    const legacyAging = makeLegacyAging("UYU", { "0_30": 500 });

    const diag = buildAgingComparativeDiagnostics(instResult, legacyAging, "installment_shadow");

    const delta = diag.installment_vs_legacy_delta.byCurrency.find((d) => d.currency === "UYU");
    expect(delta).toBeDefined();
    // installment_overdue_total=500, legacy_overdue_total=0 → diff=500
    expect(delta!.installment_overdue_total).toBe(500);
    expect(delta!.legacy_overdue_total).toBe(0);
    expect(delta!.diff).toBe(500);
    expect(delta!.hidden_overdue).toBe(500);
    expect(delta!.underestimated).toBe(true);
    expect(delta!.pct_diff).toBeNull(); // legacyOverdue=0 → null
  });
});

// ---------------------------------------------------------------------------
// Mixed aging: factura con cuotas current Y vencidas simultáneamente
// ---------------------------------------------------------------------------

describe("buildAgingComparativeDiagnostics — mixed aging", () => {
  it("has_partial_overdue=true y mixed_aging_invoice_count>0", () => {
    const installments = [
      // inv-1 tiene cuota current y cuota vencida → mixed
      makeCurrent(300),
      makeOverdue(200, 45, "inv-1"),
    ];
    const instResult = computeInstallmentAging(installments, NOW);
    expect(instResult.mixedAgingInvoiceCount).toBe(1);

    const legacyAging = makeLegacyAging("UYU", { "31_60": 200 });
    const diag = buildAgingComparativeDiagnostics(instResult, legacyAging, "installment_shadow");

    const delta = diag.installment_vs_legacy_delta.byCurrency.find((d) => d.currency === "UYU");
    expect(delta!.has_partial_overdue).toBe(true);
    expect(diag.installment_vs_legacy_delta.mixed_aging_invoice_count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Partial overdue: installment_aging_by_currency tiene cuotas en ambos lados
// ---------------------------------------------------------------------------

describe("buildAgingComparativeDiagnostics — partial overdue buckets", () => {
  it("installment_aging_by_currency refleja correctamente current + overdue", () => {
    const installments = [
      makeCurrent(400),
      makeOverdue(100, 10), // overdue_0_30
      makeOverdue(150, 50), // overdue_31_60
    ];
    const instResult = computeInstallmentAging(installments, NOW);
    const legacyAging = makeLegacyAging("UYU", { "31_60": 150 });

    const diag = buildAgingComparativeDiagnostics(instResult, legacyAging, "installment_shadow");

    const buckets = diag.installment_aging_by_currency["UYU"];
    expect(buckets).toBeDefined();
    const current = buckets!.find((b) => b.range === "current");
    const o030 = buckets!.find((b) => b.range === "overdue_0_30");
    const o3160 = buckets!.find((b) => b.range === "overdue_31_60");
    expect(current!.amount).toBe(400);
    expect(o030!.amount).toBe(100);
    expect(o3160!.amount).toBe(150);
    // Porcentaje del current sobre pending total (650 total)
    expect(current!.percentage).toBeCloseTo(400 / 650, 2);
  });
});

// ---------------------------------------------------------------------------
// Multi-moneda: USD y UYU con deltas distintos
// ---------------------------------------------------------------------------

describe("buildAgingComparativeDiagnostics — multi-currency", () => {
  it("calcula delta por separado para USD y UYU", () => {
    const installments = [
      makeOverdue(1000, 40, "inv-uyu", "UYU"),
      makeOverdue(500, 10, "inv-usd", "USD"),  // overdue_0_30 (invisible para legacy)
    ];
    const instResult = computeInstallmentAging(installments, NOW);

    const legacyAging: Partial<Record<"UYU" | "USD", AgingBucket[]>> = {
      ...makeLegacyAging("UYU", { "31_60": 1000 }),
      ...makeLegacyAging("USD", { "0_30": 500 }), // legacy 0_30 no cuenta como overdue
    };

    const diag = buildAgingComparativeDiagnostics(instResult, legacyAging, "installment_shadow");

    const uyu = diag.installment_vs_legacy_delta.byCurrency.find((d) => d.currency === "UYU");
    const usd = diag.installment_vs_legacy_delta.byCurrency.find((d) => d.currency === "USD");

    expect(uyu!.diff).toBe(0); // parity
    expect(usd!.diff).toBe(500); // installment detecta 500 USD que legacy no ve
    expect(usd!.hidden_overdue).toBe(500);
    expect(diag.installment_vs_legacy_delta.total_hidden_overdue).toBe(500);
    expect(diag.installment_vs_legacy_delta.any_underestimated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Empty installments: sin cuotas → no_data
// ---------------------------------------------------------------------------

describe("buildAgingComparativeDiagnostics — empty installments", () => {
  it("recommendation=no_data cuando no hay cuotas", () => {
    const instResult = computeInstallmentAging([], NOW);
    const legacyAging = makeLegacyAging("UYU", { "31_60": 500 });

    const diag = buildAgingComparativeDiagnostics(instResult, legacyAging, "installment_shadow");

    expect(diag.installment_vs_legacy_delta.recommendation).toBe("no_data");
    expect(diag.installment_vs_legacy_delta.total_hidden_overdue).toBe(0);
  });

  it("byCurrency vacío cuando no hay cuotas ni legacy", () => {
    const instResult = computeInstallmentAging([], NOW);
    const diag = buildAgingComparativeDiagnostics(instResult, {}, "legacy");

    expect(diag.installment_aging_by_currency).toEqual({});
    expect(diag.installment_vs_legacy_delta.byCurrency).toHaveLength(0);
    expect(diag.installment_vs_legacy_delta.recommendation).toBe("no_data");
  });
});

// ---------------------------------------------------------------------------
// Recommendation: monitor cuando hidden > 5% del pending total
// ---------------------------------------------------------------------------

describe("buildAgingComparativeDiagnostics — recommendation monitor", () => {
  it("recommendation=monitor cuando hidden_overdue supera el 5% del pending legacy", () => {
    // Legacy pending total = 10000 UYU, overdue legacy = 500 (en 31_60)
    // Installment overdue = 1500 → diff = 1000 → 1000/10000 = 10% > 5% → monitor
    const installments = [makeOverdue(1500, 40, "inv-1", "UYU")];
    const instResult = computeInstallmentAging(installments, NOW);

    const legacyAging = makeLegacyAging("UYU", { "0_30": 9500, "31_60": 500 });

    const diag = buildAgingComparativeDiagnostics(instResult, legacyAging, "installment_shadow");

    expect(diag.installment_vs_legacy_delta.recommendation).toBe("monitor");
  });

  it("recommendation=switch_ready cuando hidden_overdue está por debajo del 5%", () => {
    // Legacy pending = 10000, overdue legacy = 9800, installment overdue = 9850 → diff=50 → 50/10000=0.5% < 5%
    const installments = [makeOverdue(9850, 40, "inv-1", "UYU")];
    const instResult = computeInstallmentAging(installments, NOW);

    const legacyAging = makeLegacyAging("UYU", { "0_30": 200, "31_60": 9800 });

    const diag = buildAgingComparativeDiagnostics(instResult, legacyAging, "installment_shadow");

    expect(diag.installment_vs_legacy_delta.recommendation).toBe("switch_ready");
  });
});

// ---------------------------------------------------------------------------
// Fallback legacy: modo legacy expone el mode flag pero no computa delta en route
// (El motor lo acepta igual — la decisión de no llamarlo la toma el route.)
// ---------------------------------------------------------------------------

describe("buildAgingComparativeDiagnostics — mode flag", () => {
  it("retorna mode=legacy correctamente aunque se llame con ese mode", () => {
    const instResult = computeInstallmentAging([makeCurrent(100)], NOW);
    const diag = buildAgingComparativeDiagnostics(instResult, {}, "legacy");
    expect(diag.mode).toBe("legacy");
  });

  it("retorna mode=installment cuando se pasa ese mode", () => {
    const instResult = computeInstallmentAging([makeCurrent(100)], NOW);
    const diag = buildAgingComparativeDiagnostics(instResult, {}, "installment");
    expect(diag.mode).toBe("installment");
  });
});

// ---------------------------------------------------------------------------
// overdue_invoice_count
// ---------------------------------------------------------------------------

describe("buildAgingComparativeDiagnostics — overdue_invoice_count", () => {
  it("cuenta correctamente el número de facturas con al menos una cuota vencida", () => {
    const installments = [
      makeOverdue(200, 15, "inv-A", "UYU"),
      makeOverdue(300, 45, "inv-A", "UYU"), // mismo invoice
      makeOverdue(100, 10, "inv-B", "UYU"), // distinto invoice
      makeCurrent(500, "UYU"),
    ];
    const instResult = computeInstallmentAging(installments, NOW);
    expect(instResult.overdueInvoices).toHaveLength(2);

    const diag = buildAgingComparativeDiagnostics(instResult, {}, "installment_shadow");
    expect(diag.installment_vs_legacy_delta.overdue_invoice_count).toBe(2);
  });
});
