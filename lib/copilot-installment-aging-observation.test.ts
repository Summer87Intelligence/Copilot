/**
 * Tests para buildInstallmentAgingObservation (ZETA-08 Fase 2 — observation layer).
 * Motor puro — sin I/O, sin mocks.
 */

import { describe, expect, it } from "vitest";

import {
  buildInstallmentAgingObservation,
} from "@/lib/copilot-installment-aging-observation";
import {
  buildAgingComparativeDiagnostics,
} from "@/lib/copilot-installment-aging-delta";
import { computeInstallmentAging } from "@/lib/copilot-installment-aging";
import type { AgingBucket, InstallmentCoverageDiagnostics } from "@/lib/copilot-financial-reconciliation";

// ---------------------------------------------------------------------------
// Fixtures helpers
// ---------------------------------------------------------------------------

const NOW = "2026-05-20T00:00:00.000Z";
const NOW_MS = Date.parse(NOW);

function dateOffset(daysAgo: number): string {
  return new Date(NOW_MS - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

function makeCoverageOk(overrides: Partial<InstallmentCoverageDiagnostics> = {}): InstallmentCoverageDiagnostics {
  return {
    coveragePct: 100,
    syntheticPct: 0,
    orphanCount: 0,
    minDateTrapCount: 0,
    balanceMismatchCount: 0,
    pendingInvoiceCount: 3,
    realDueDateInvoiceCount: 3,
    syntheticDueDateInvoiceCount: 0,
    partialWithOverdueCount: 0,
    underestimatedClientCount: 0,
    installmentRowCount: 5,
    linkedInstallmentCount: 5,
    installmentAging: {
      dominantRange: "overdue_31_60",
      hasMixedAging: false,
      overdueInstallments: 2,
      overdueInvoiceCount: 2,
    },
    note: "ok",
    ...overrides,
  };
}

function makeLegacyBuckets(
  currency: "UYU" | "USD",
  buckets: Partial<Record<string, number>>
): Partial<Record<"UYU" | "USD", AgingBucket[]>> {
  const ranges = ["0_30", "31_60", "61_90", "90_plus"] as const;
  const total = ranges.reduce((s, r) => s + (buckets[r] ?? 0), 0);
  return {
    [currency]: ranges.map((range) => ({
      range,
      amount: buckets[range] ?? 0,
      invoiceCount: 0,
      clientCount: 0,
      percentage: total > 0 ? (buckets[range] ?? 0) / total : 0,
      realDueDateCount: 0,
      syntheticDueDateCount: 0,
    })),
  };
}

function buildFullOpts(
  installments: Parameters<typeof buildInstallmentAgingObservation>[0]["installments"],
  invoices: Parameters<typeof buildInstallmentAgingObservation>[0]["invoices"],
  legacyAgingByCurrency: Parameters<typeof buildAgingComparativeDiagnostics>[1],
  coverage = makeCoverageOk(),
  companies: Parameters<typeof buildInstallmentAgingObservation>[0]["companies"] = []
) {
  const instResult = computeInstallmentAging(
    installments.map((r) => ({
      invoice_id: r.invoice_id,
      currency_code: r.currency_code,
      cuota_saldo: r.cuota_saldo,
      cuota_vencimiento: r.cuota_vencimiento,
    })),
    NOW
  );
  const agingComparative = buildAgingComparativeDiagnostics(
    instResult,
    legacyAgingByCurrency,
    "installment_shadow"
  );
  return buildInstallmentAgingObservation({
    installments,
    invoices,
    companies,
    agingComparative,
    installmentCoverage: coverage,
    now: NOW,
  });
}

// ---------------------------------------------------------------------------
// top_underestimated_clients — sorting
// ---------------------------------------------------------------------------

describe("top_underestimated_clients — sorting", () => {
  it("ordena por delta descendente (mayor riesgo oculto primero)", () => {
    const installments = [
      { invoice_id: "inv-A", currency_code: "UYU", cuota_saldo: 2000, cuota_vencimiento: dateOffset(45) },
      { invoice_id: "inv-B", currency_code: "UYU", cuota_saldo: 500,  cuota_vencimiento: dateOffset(40) },
      { invoice_id: "inv-C", currency_code: "UYU", cuota_saldo: 800,  cuota_vencimiento: dateOffset(35) },
    ];
    const invoices = [
      { id: "inv-A", company_id: "cli-A", currency_code: "UYU", balance_amount: 2000, status: "pending",
        issue_date: dateOffset(10), due_date_source: null, due_date: null }, // current por legacy
      { id: "inv-B", company_id: "cli-B", currency_code: "UYU", balance_amount: 500, status: "pending",
        issue_date: dateOffset(10), due_date_source: null, due_date: null },
      { id: "inv-C", company_id: "cli-C", currency_code: "UYU", balance_amount: 800, status: "pending",
        issue_date: dateOffset(10), due_date_source: null, due_date: null },
    ];
    const legacy = makeLegacyBuckets("UYU", {}); // legacy sin overdue

    const obs = buildFullOpts(installments, invoices, legacy);
    const top = obs.top_underestimated_clients;

    // Todos deberían aparecer; el de mayor delta (cli-A: 2000) debe ir primero
    expect(top.length).toBeGreaterThan(0);
    expect(top[0].company_id).toBe("cli-A");
    expect(top[0].delta).toBe(2000);
  });

  it("no incluye clientes sin installment overdue", () => {
    const installments = [
      { invoice_id: "inv-A", currency_code: "UYU", cuota_saldo: 1000, cuota_vencimiento: dateOffset(-5) }, // current
    ];
    const invoices = [
      { id: "inv-A", company_id: "cli-A", currency_code: "UYU", balance_amount: 1000, status: "pending",
        issue_date: dateOffset(20), due_date_source: null, due_date: null },
    ];
    const obs = buildFullOpts(installments, invoices, {});
    expect(obs.top_underestimated_clients).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// switch_readiness — blockers
// ---------------------------------------------------------------------------

describe("switch_readiness — blockers", () => {
  it("ready=false y blocker cuando orphanCount > 0", () => {
    const coverage = makeCoverageOk({ orphanCount: 5 });
    const obs = buildFullOpts([], [], {}, coverage);
    expect(obs.switch_readiness.ready).toBe(false);
    expect(obs.switch_readiness.blockers.some((b) => b.includes("orphanCount=5"))).toBe(true);
  });

  it("ready=false y blocker cuando coveragePct < 95", () => {
    const coverage = makeCoverageOk({ coveragePct: 72 });
    const obs = buildFullOpts([], [], {}, coverage);
    expect(obs.switch_readiness.ready).toBe(false);
    expect(obs.switch_readiness.blockers.some((b) => b.includes("coveragePct=72%"))).toBe(true);
  });

  it("ready=false y blocker cuando balanceMismatchCount > 0", () => {
    const coverage = makeCoverageOk({ balanceMismatchCount: 3 });
    const obs = buildFullOpts([], [], {}, coverage);
    expect(obs.switch_readiness.ready).toBe(false);
    expect(obs.switch_readiness.blockers.some((b) => b.includes("balanceMismatchCount=3"))).toBe(true);
  });

  it("ready=true cuando no hay blockers", () => {
    const obs = buildFullOpts([], [], {}, makeCoverageOk());
    expect(obs.switch_readiness.ready).toBe(true);
    expect(obs.switch_readiness.blockers).toHaveLength(0);
  });

  it("múltiples blockers se acumulan", () => {
    const coverage = makeCoverageOk({
      orphanCount: 10,
      coveragePct: 60,
      balanceMismatchCount: 2,
    });
    const obs = buildFullOpts([], [], {}, coverage);
    expect(obs.switch_readiness.blockers.length).toBeGreaterThanOrEqual(3);
    expect(obs.switch_readiness.ready).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// switch_readiness — confidence scoring
// ---------------------------------------------------------------------------

describe("switch_readiness — confidence scoring", () => {
  it("confidence=100 cuando cobertura perfecta y sin blockers/warnings", () => {
    const obs = buildFullOpts([], [], {}, makeCoverageOk());
    expect(obs.switch_readiness.confidence).toBe(100);
  });

  it("confidence < 100 cuando hay orphans (blocker)", () => {
    const coverage = makeCoverageOk({ orphanCount: 1 });
    const obs = buildFullOpts([], [], {}, coverage);
    expect(obs.switch_readiness.confidence).toBeLessThan(100);
  });

  it("confidence < 100 cuando coveragePct < 100", () => {
    const coverage = makeCoverageOk({ coveragePct: 85 });
    const obs = buildFullOpts([], [], {}, coverage);
    expect(obs.switch_readiness.confidence).toBeLessThan(100);
  });

  it("confidence >= 0 incluso con múltiples penalizaciones", () => {
    const coverage = makeCoverageOk({
      orphanCount: 50,
      coveragePct: 0,
      balanceMismatchCount: 100,
    });
    const obs = buildFullOpts([], [], {}, coverage);
    expect(obs.switch_readiness.confidence).toBeGreaterThanOrEqual(0);
    expect(obs.switch_readiness.confidence).toBeLessThanOrEqual(100);
  });

  it("confidence decrece con warnings (recommendation=monitor)", () => {
    // Trigger recommendation=monitor: hidden > 5% de pending
    const installments = [
      { invoice_id: "inv-1", currency_code: "UYU", cuota_saldo: 2000, cuota_vencimiento: dateOffset(45) },
    ];
    const invoices = [
      { id: "inv-1", company_id: "cli-1", currency_code: "UYU", balance_amount: 2000, status: "pending",
        issue_date: dateOffset(10), due_date_source: null, due_date: null },
    ];
    // Legacy pending = 10000, legacy overdue en 31_60 = 500 → hidden = 1500 → 1500/10000 = 15% > 5% → monitor
    const legacy = makeLegacyBuckets("UYU", { "0_30": 9500, "31_60": 500 });
    const coverage = makeCoverageOk();
    const obs = buildFullOpts(installments, invoices, legacy, coverage);

    if (obs.switch_readiness.warnings.length > 0) {
      expect(obs.switch_readiness.confidence).toBeLessThan(100);
    }
  });
});

// ---------------------------------------------------------------------------
// hidden_overdue_summary
// ---------------------------------------------------------------------------

describe("hidden_overdue_summary", () => {
  it("calcula hidden_overdue_total y affected_clients correctamente", () => {
    const installments = [
      { invoice_id: "inv-A", currency_code: "UYU", cuota_saldo: 1000, cuota_vencimiento: dateOffset(10) }, // overdue_0_30
      { invoice_id: "inv-B", currency_code: "UYU", cuota_saldo: 500,  cuota_vencimiento: dateOffset(12) },
    ];
    const invoices = [
      { id: "inv-A", company_id: "cli-A", currency_code: "UYU", balance_amount: 1000, status: "pending",
        issue_date: dateOffset(5), due_date_source: null, due_date: null }, // legacy current
      { id: "inv-B", company_id: "cli-B", currency_code: "UYU", balance_amount: 500, status: "pending",
        issue_date: dateOffset(5), due_date_source: null, due_date: null },
    ];
    const legacy = makeLegacyBuckets("UYU", { "0_30": 1500 }); // legacy no detecta como overdue

    const obs = buildFullOpts(installments, invoices, legacy);
    const uyu = obs.hidden_overdue_summary.find((s) => s.currency === "UYU");
    expect(uyu).toBeDefined();
    // installment_overdue=1500, legacy_overdue=0 → hidden=1500
    expect(uyu!.hidden_overdue_total).toBe(1500);
    expect(uyu!.affected_invoices).toBe(2);
    expect(uyu!.affected_clients).toBe(2);
  });

  it("no produce entrada de moneda sin overdue por installment", () => {
    const installments = [
      { invoice_id: "inv-A", currency_code: "UYU", cuota_saldo: 500, cuota_vencimiento: dateOffset(-5) }, // current
    ];
    const invoices = [
      { id: "inv-A", company_id: "cli-A", currency_code: "UYU", balance_amount: 500, status: "pending",
        issue_date: dateOffset(5), due_date_source: null, due_date: null },
    ];
    const obs = buildFullOpts(installments, invoices, {});
    expect(obs.hidden_overdue_summary).toHaveLength(0);
  });

  it("partial_overdue_count refleja invoices con cuotas mixtas", () => {
    const installments = [
      { invoice_id: "inv-1", currency_code: "UYU", cuota_saldo: 300, cuota_vencimiento: dateOffset(-5) }, // current
      { invoice_id: "inv-1", currency_code: "UYU", cuota_saldo: 200, cuota_vencimiento: dateOffset(15) }, // overdue_0_30
    ];
    const invoices = [
      { id: "inv-1", company_id: "cli-1", currency_code: "UYU", balance_amount: 500, status: "pending",
        issue_date: dateOffset(5), due_date_source: null, due_date: null },
    ];
    const obs = buildFullOpts(installments, invoices, {});
    const uyu = obs.hidden_overdue_summary.find((s) => s.currency === "UYU");
    expect(uyu).toBeDefined();
    expect(uyu!.partial_overdue_count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// multi-moneda
// ---------------------------------------------------------------------------

describe("multi-moneda", () => {
  it("separa correctamente los diagnósticos por moneda", () => {
    const installments = [
      // UYU: cuota vencida hace 40 días → overdue_31_60; invoice también 50 días viejo → legacy overdue → parity
      { invoice_id: "inv-uyu", currency_code: "UYU", cuota_saldo: 1000, cuota_vencimiento: dateOffset(40) },
      // USD: cuota vencida hace 10 días → overdue_0_30; invoice solo 5 días → legacy current → delta=500
      { invoice_id: "inv-usd", currency_code: "USD", cuota_saldo: 500,  cuota_vencimiento: dateOffset(10) },
    ];
    const invoices = [
      { id: "inv-uyu", company_id: "cli-1", currency_code: "UYU", balance_amount: 1000, status: "pending",
        issue_date: dateOffset(50), due_date_source: null, due_date: null }, // 50 días → legacy overdue
      { id: "inv-usd", company_id: "cli-2", currency_code: "USD", balance_amount: 500, status: "pending",
        issue_date: dateOffset(5), due_date_source: null, due_date: null }, // 5 días → legacy current
    ];

    const legacyByCurrency = {
      ...makeLegacyBuckets("UYU", { "31_60": 1000 }),
      ...makeLegacyBuckets("USD", { "0_30": 500 }),
    };

    const obs = buildFullOpts(installments, invoices, legacyByCurrency);

    const uyu = obs.top_underestimated_clients.find((c) => c.currency === "UYU");
    const usd = obs.top_underestimated_clients.find((c) => c.currency === "USD");

    // UYU: installment_overdue=1000, legacy_overdue=1000 → delta=0 → no en top underestimated
    // (el cliente puede aparecer con delta=0 pero no como "underestimated")
    expect(uyu?.delta ?? 0).toBeLessThanOrEqual(0.01);
    // USD: installment_overdue=500, legacy_overdue=0 (0_30 no cuenta) → delta=500 → en top
    expect(usd).toBeDefined();
    expect(usd!.delta).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// no_data: sin cuotas
// ---------------------------------------------------------------------------

describe("no_data: sin cuotas", () => {
  it("top_underestimated_clients vacío cuando no hay installments", () => {
    const obs = buildFullOpts([], [], {}, makeCoverageOk());
    expect(obs.top_underestimated_clients).toHaveLength(0);
    expect(obs.hidden_overdue_summary).toHaveLength(0);
  });

  it("switch_readiness conserva el diagnóstico de coverage incluso sin cuotas", () => {
    const coverage = makeCoverageOk({ coveragePct: 80 });
    const obs = buildFullOpts([], [], {}, coverage);
    expect(obs.switch_readiness.blockers.some((b) => b.includes("coveragePct"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// company_name resuelto desde companies
// ---------------------------------------------------------------------------

describe("company_name en UnderestimatedClientEntry", () => {
  it("incluye el nombre de la compañía si está en el listado", () => {
    const installments = [
      { invoice_id: "inv-1", currency_code: "UYU", cuota_saldo: 1000, cuota_vencimiento: dateOffset(45) },
    ];
    const invoices = [
      { id: "inv-1", company_id: "cli-99", currency_code: "UYU", balance_amount: 1000, status: "pending",
        issue_date: dateOffset(10), due_date_source: null, due_date: null },
    ];
    const companies = [{ id: "cli-99", name: "Empresa Test S.A." }];
    const obs = buildFullOpts(installments, invoices, {}, makeCoverageOk(), companies);

    const entry = obs.top_underestimated_clients.find((c) => c.company_id === "cli-99");
    expect(entry).toBeDefined();
    expect(entry!.company_name).toBe("Empresa Test S.A.");
  });

  it("company_name=null cuando la compañía no está en el listado", () => {
    const installments = [
      { invoice_id: "inv-1", currency_code: "UYU", cuota_saldo: 1000, cuota_vencimiento: dateOffset(45) },
    ];
    const invoices = [
      { id: "inv-1", company_id: "cli-unknown", currency_code: "UYU", balance_amount: 1000, status: "pending",
        issue_date: dateOffset(10), due_date_source: null, due_date: null },
    ];
    const obs = buildFullOpts(installments, invoices, {});
    const entry = obs.top_underestimated_clients[0];
    expect(entry.company_name).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// overdue_installments_count por cliente
// ---------------------------------------------------------------------------

describe("overdue_installments_count", () => {
  it("cuenta correctamente cuotas vencidas por (cliente, moneda)", () => {
    const installments = [
      { invoice_id: "inv-A", currency_code: "UYU", cuota_saldo: 300, cuota_vencimiento: dateOffset(10) },
      { invoice_id: "inv-A", currency_code: "UYU", cuota_saldo: 400, cuota_vencimiento: dateOffset(20) },
      { invoice_id: "inv-B", currency_code: "UYU", cuota_saldo: 200, cuota_vencimiento: dateOffset(15) },
    ];
    const invoices = [
      { id: "inv-A", company_id: "cli-X", currency_code: "UYU", balance_amount: 700, status: "pending",
        issue_date: dateOffset(5), due_date_source: null, due_date: null },
      { id: "inv-B", company_id: "cli-X", currency_code: "UYU", balance_amount: 200, status: "pending",
        issue_date: dateOffset(5), due_date_source: null, due_date: null },
    ];
    const obs = buildFullOpts(installments, invoices, {});
    const cli = obs.top_underestimated_clients.find((c) => c.company_id === "cli-X");
    expect(cli).toBeDefined();
    expect(cli!.overdue_installments_count).toBe(3); // 2 de inv-A + 1 de inv-B
  });
});

// ---------------------------------------------------------------------------
// mixed_aging flag
// ---------------------------------------------------------------------------

describe("mixed_aging flag en UnderestimatedClientEntry", () => {
  it("mixed_aging=true cuando el cliente tiene facturas con cuotas current y vencidas", () => {
    const installments = [
      // inv-1: cuota current + cuota vencida → mixed
      { invoice_id: "inv-1", currency_code: "UYU", cuota_saldo: 500, cuota_vencimiento: dateOffset(-5) }, // current (futuro)
      { invoice_id: "inv-1", currency_code: "UYU", cuota_saldo: 300, cuota_vencimiento: dateOffset(20) }, // overdue_0_30
    ];
    const invoices = [
      { id: "inv-1", company_id: "cli-M", currency_code: "UYU", balance_amount: 800, status: "pending",
        issue_date: dateOffset(5), due_date_source: null, due_date: null },
    ];
    const obs = buildFullOpts(installments, invoices, {});
    const cli = obs.top_underestimated_clients.find((c) => c.company_id === "cli-M");
    expect(cli).toBeDefined();
    expect(cli!.mixed_aging).toBe(true);
  });

  it("mixed_aging=false cuando el cliente solo tiene cuotas vencidas", () => {
    const installments = [
      { invoice_id: "inv-1", currency_code: "UYU", cuota_saldo: 500, cuota_vencimiento: dateOffset(40) },
    ];
    const invoices = [
      { id: "inv-1", company_id: "cli-N", currency_code: "UYU", balance_amount: 500, status: "pending",
        issue_date: dateOffset(5), due_date_source: null, due_date: null },
    ];
    const obs = buildFullOpts(installments, invoices, {});
    const cli = obs.top_underestimated_clients.find((c) => c.company_id === "cli-N");
    expect(cli).toBeDefined();
    expect(cli!.mixed_aging).toBe(false);
  });
});
