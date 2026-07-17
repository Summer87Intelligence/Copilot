import { describe, it, expect } from "vitest";

import { buildIntegrityReport } from "@/lib/integrity/integrity-report";
import type { IntegrityInputs, IntegrityDocInput } from "@/lib/integrity/integrity-rules";
import { mapLinkRowsToReconciliationLinks } from "@/lib/integrity/integrity-link-map";
import type { IntegrityFinding } from "@/lib/integrity/integrity-types";
import type { ReconciliationLink } from "@/lib/bank-movements/bank-reconciliation-links";

function doc(o: Partial<IntegrityDocInput> = {}): IntegrityDocInput {
  return {
    id: "d1",
    label: "F-1",
    rawCurrency: "UYU",
    resolvedCurrency: "UYU",
    issueDate: "2026-07-10",
    clientId: "c1",
    isVoided: false,
    includedInKpi: true,
    isCreditNote: false,
    creditNoteRef: null,
    registroKey: "r1",
    ...o,
  };
}

function findingIds(inputs: IntegrityInputs): string[] {
  return buildIntegrityReport(inputs).findings.map((f) => f.ruleId);
}

describe("documents rules", () => {
  it("detecta documento sin moneda resoluble (critical)", () => {
    const ids = findingIds({ documents: [doc({ resolvedCurrency: null, rawCurrency: null })] });
    expect(ids).toContain("documents-without-currency");
  });
  it("detecta moneda inválida", () => {
    const ids = findingIds({ documents: [doc({ resolvedCurrency: null, rawCurrency: "EUR" })] });
    expect(ids).toContain("documents-invalid-currency");
  });
  it("detecta anulado incluido en KPI", () => {
    const ids = findingIds({ documents: [doc({ isVoided: true })] });
    expect(ids).toContain("voided-documents-in-kpi");
  });
  it("detecta documento previo a 2026 en KPI", () => {
    const ids = findingIds({ documents: [doc({ issueDate: "2025-12-30" })] });
    expect(ids).toContain("documents-before-2026-in-kpi");
  });
  it("detecta NC sin referencia", () => {
    const ids = findingIds({ documents: [doc({ isCreditNote: true, creditNoteRef: null })] });
    expect(ids).toContain("credit-note-without-reference");
  });
  it("detecta duplicados por registro", () => {
    const ids = findingIds({ documents: [doc({ id: "a", registroKey: "R" }), doc({ id: "b", registroKey: "R" })] });
    expect(ids).toContain("duplicate-documents");
  });
  it("documento limpio no dispara nada", () => {
    expect(findingIds({ documents: [doc()] })).toHaveLength(0);
  });
});

describe("sales divergence rules", () => {
  it("detecta Ventas vs Reportes fuera de tolerancia", () => {
    const ids = findingIds({ salesNet: { sales: { UYU: 1000, USD: 0 }, reports: { UYU: 900, USD: 0 } } });
    expect(ids).toContain("sales-vs-reports-divergence");
  });
  it("no dispara si están dentro de tolerancia", () => {
    const ids = findingIds({ salesNet: { sales: { UYU: 1000, USD: 0 }, finance: { UYU: 1000.5, USD: 0 } } });
    expect(ids).not.toContain("sales-vs-finance-divergence");
  });
});

describe("cobranza rules", () => {
  it("detecta aplicación mayor al saldo", () => {
    const ids = findingIds({ cobranza: [{ id: "r1", label: "Recibo 1", applied: 500, outstanding: 300, currency: "UYU", agingDays: 10 }] });
    expect(ids).toContain("receipt-application-over-balance");
  });
  it("detecta saldo y atraso negativos", () => {
    const ids = findingIds({ cobranza: [{ id: "r2", label: "Recibo 2", applied: 0, outstanding: -5, currency: "UYU", agingDays: -3 }] });
    expect(ids).toContain("negative-outstanding");
    expect(ids).toContain("negative-aging");
  });
});

function link(o: Partial<ReconciliationLink> = {}): ReconciliationLink {
  return {
    id: "l1", bankMovementId: "m1", targetType: "receipt", targetId: "r1",
    appliedAmount: 100, currency: "UYU", direction: "inflow", method: "manual",
    confidence: null, archivedAt: null, ...o,
  };
}

describe("banco rules", () => {
  it("detecta fingerprint duplicado", () => {
    const ids = findingIds({ bank: { movements: [
      { id: "a", label: "mov a", amount: 100, currency: "UYU", fingerprint: "FP" },
      { id: "b", label: "mov b", amount: 100, currency: "UYU", fingerprint: "FP" },
    ], links: [] } });
    expect(ids).toContain("bank-duplicate-fingerprint");
  });
  it("detecta sobre-aplicación (doble conteo)", () => {
    const ids = findingIds({ bank: {
      movements: [{ id: "m1", label: "mov", amount: 1000, currency: "UYU", fingerprint: null }],
      links: [link({ id: "l1", appliedAmount: 700 }), link({ id: "l2", appliedAmount: 500 })],
    } });
    expect(ids).toContain("bank-reconciliation-over-applied");
  });
  it("detecta link cruzando monedas", () => {
    const ids = findingIds({ bank: {
      movements: [{ id: "m1", label: "mov", amount: 1000, currency: "USD", fingerprint: null }],
      links: [link({ bankMovementId: "m1", currency: "UYU" })],
    } });
    expect(ids).toContain("bank-cross-currency-link");
  });
});

describe("comerciales rules", () => {
  it("detecta cliente con múltiples comerciales activos", () => {
    const ids = findingIds({ comerciales: [
      { clientId: "c1", clientLabel: "ACME", salespersonId: "s1", active: true, validFrom: "2026-01-01", validTo: null },
      { clientId: "c1", clientLabel: "ACME", salespersonId: "s2", active: true, validFrom: "2026-02-01", validTo: null },
    ] });
    expect(ids).toContain("client-multiple-active-salespeople");
  });
  it("detecta vigencias superpuestas", () => {
    const ids = findingIds({ comerciales: [
      { clientId: "c1", clientLabel: "ACME", salespersonId: "s1", active: false, validFrom: "2026-01-01", validTo: "2026-03-01" },
      { clientId: "c1", clientLabel: "ACME", salespersonId: "s2", active: false, validFrom: "2026-02-01", validTo: "2026-04-01" },
    ] });
    expect(ids).toContain("salesperson-overlapping-vigencias");
  });
});

describe("clientes rules", () => {
  it("detecta cliente sin nombre y con ventas sin ficha", () => {
    const ids = findingIds({ clientes: [{ id: "c1", name: null, docNumber: "123", hasSales: true }] });
    expect(ids).toContain("client-without-name");
    expect(ids).toContain("client-with-sales-no-record");
  });
  it("detecta duplicado por documento", () => {
    const ids = findingIds({ clientes: [
      { id: "c1", name: "A", docNumber: "D", hasSales: false },
      { id: "c2", name: "A dup", docNumber: "D", hasSales: false },
    ] });
    expect(ids).toContain("client-duplicate-document");
  });
});

describe("system rules", () => {
  it("detecta cron detenido / sync fallido / tablas sin RLS", () => {
    const ids = findingIds({ system: {
      hoursSinceCron: 50, hoursSinceSync: 1, hoursSinceSnapshot: 1, lastSyncFailed: true,
      rlsAudit: [{ table: "foo", rlsEnabled: false, policies: 0 }], pendingMigrations: 2,
    } });
    expect(ids).toContain("cron-stalled");
    expect(ids).toContain("sync-zeta-failed");
    expect(ids).toContain("tables-without-rls");
    expect(ids).toContain("pending-migrations");
  });
});

describe("aggregator", () => {
  it("estado critical cuando hay críticos; skip cuenta cobertura", () => {
    const report = buildIntegrityReport({ documents: [doc({ isVoided: true })] });
    expect(report.status).toBe("critical");
    expect(report.counts.critical).toBeGreaterThanOrEqual(1);
    // sin inputs de banco/system/etc → reglas skipped registradas
    expect(report.coverage.skipped).toBeGreaterThan(0);
    expect(report.byCategory.documents).toBeGreaterThanOrEqual(1);
  });
  it("healthy cuando no hay hallazgos", () => {
    const report = buildIntegrityReport({ documents: [doc()] });
    expect(report.status).toBe("healthy");
    expect(report.counts.total).toBe(0);
    expect(report.passes.length).toBeGreaterThan(0);
  });

  it("mergea hallazgos externos (p.ej. zeta_integrity_violations) y los cuenta", () => {
    const external: IntegrityFinding[] = [
      {
        ruleId: "zeta:orphan_close", category: "documents", severity: "critical",
        title: "Zeta · orphan_close", count: 3, impact: "x", where: "zeta_integrity_violations",
        modules: ["ventas"], resolution: "y", autoRepairable: false,
        evidence: [{ entityId: "e1", label: "invoice", detail: "d" }],
      },
    ];
    const report = buildIntegrityReport({ documents: [doc()] }, undefined, new Date(), external);
    expect(report.status).toBe("critical");
    expect(report.counts.critical).toBe(1);
    expect(report.findings.some((f) => f.ruleId === "zeta:orphan_close")).toBe(true);
  });
});

describe("mapLinkRowsToReconciliationLinks", () => {
  it("mapea filas crudas de links preservando importe/moneda/dirección", () => {
    const [link] = mapLinkRowsToReconciliationLinks([
      {
        id: "l1", bank_movement_id: "m1", target_type: "receipt", target_id: "r1",
        applied_amount: "250.50", currency: "USD", direction: "outflow", method: "manual",
        confidence: null, archived_at: null,
      },
    ]);
    expect(link).toMatchObject({ id: "l1", bankMovementId: "m1", appliedAmount: 250.5, currency: "USD", direction: "outflow" });
  });
});
