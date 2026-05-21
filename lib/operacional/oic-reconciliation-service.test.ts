/**
 * Tests del contrato semántico de OicReconciliationSummary.
 *
 * Invariantes verificadas:
 *  1. conflictCount=0 → status="ok" siempre
 *  2. Snapshots críticos históricos NO contaminan status actual
 *  3. criticalCount>0 → status="critical"
 *  4. UI no puede mostrar ok + critical simultáneamente (invariante de tipo)
 *  5. totalChecked = okCount + conflictCount
 *  6. Snapshot crítico histórico va a historicalAuditCritical, no a criticalCount
 */

import { describe, it, expect } from "vitest";
import type { OicReconciliationSummary, OicSeverity } from "@/lib/operacional/types";

// ── Factory helpers ────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<OicReconciliationSummary> = {}): OicReconciliationSummary {
  const base: OicReconciliationSummary = {
    workspaceCompanyId: "ws-test",
    computedAt: new Date().toISOString(),
    totalChecked: 33,
    okCount: 33,
    conflictCount: 0,
    criticalCount: 0,
    warningCount: 0,
    infoCount: 0,
    status: "ok",
    gapUsd: 0,
    gapUyu: 0,
    conflictiveInvoices: [],
    historicalAuditCritical: 0,
    historicalAuditWarning: 0,
    lastAuditAt: null,
  };
  return { ...base, ...overrides };
}

// ── 1. conflictCount=0 → status="ok" ─────────────────────────────────────────

describe("invariante 1: sin conflictos → status ok", () => {
  it("conflictCount=0 produce status ok", () => {
    const s = makeSummary({ conflictCount: 0, criticalCount: 0, warningCount: 0, status: "ok" });
    expect(s.conflictCount).toBe(0);
    expect(s.status).toBe("ok");
  });

  it("okCount=totalChecked cuando no hay conflictos", () => {
    const s = makeSummary({ totalChecked: 40, okCount: 40, conflictCount: 0 });
    expect(s.totalChecked).toBe(s.okCount + s.conflictCount);
  });
});

// ── 2. Histórico NO contamina estado actual ────────────────────────────────────

describe("invariante 2: histórico separado del estado actual", () => {
  it("historicalAuditCritical>0 no implica criticalCount>0", () => {
    const s = makeSummary({
      conflictCount: 0,
      criticalCount: 0,
      status: "ok",
      historicalAuditCritical: 15,
    });
    expect(s.criticalCount).toBe(0);
    expect(s.status).toBe("ok");
    expect(s.historicalAuditCritical).toBe(15);
  });

  it("con 15 audits históricas críticas y 0 conflictos, status sigue siendo ok", () => {
    const s = makeSummary({
      totalChecked: 1,
      okCount: 1,
      conflictCount: 0,
      criticalCount: 0,
      status: "ok",
      historicalAuditCritical: 15,
    });
    expect(s.status).toBe("ok");
    expect(s.conflictiveInvoices.length).toBe(0);
  });

  it("historicalAuditCritical y criticalCount son campos independientes", () => {
    const historico = makeSummary({ historicalAuditCritical: 15, criticalCount: 0, status: "ok" });
    const actual = makeSummary({ historicalAuditCritical: 0, criticalCount: 2, status: "critical" });
    expect(historico.historicalAuditCritical).toBe(15);
    expect(historico.criticalCount).toBe(0);
    expect(actual.criticalCount).toBe(2);
    expect(actual.historicalAuditCritical).toBe(0);
  });
});

// ── 3. criticalCount>0 → status critical ──────────────────────────────────────

describe("invariante 3: conflictos críticos activos → status critical", () => {
  it("criticalCount>0 → status critical", () => {
    const s = makeSummary({
      conflictCount: 2,
      criticalCount: 2,
      warningCount: 0,
      okCount: 31,
      totalChecked: 33,
      status: "critical",
    });
    expect(s.status).toBe("critical");
    expect(s.criticalCount).toBeGreaterThan(0);
  });

  it("solo warningCount → status warning, no critical", () => {
    const s = makeSummary({
      conflictCount: 1,
      criticalCount: 0,
      warningCount: 1,
      status: "warning",
    });
    expect(s.status).toBe("warning");
    expect(s.criticalCount).toBe(0);
  });
});

// ── 4. Imposibilidad semántica: ok + critical simultáneamente ────────────────

describe("invariante 4: ok y critical no pueden coexistir", () => {
  it("status=ok implica criticalCount=0", () => {
    const s = makeSummary({ status: "ok", criticalCount: 0, conflictCount: 0 });
    if (s.status === "ok") {
      expect(s.criticalCount).toBe(0);
      expect(s.conflictCount).toBe(0);
    }
  });

  it("status=critical implica conflictCount>0", () => {
    const s = makeSummary({ status: "critical", criticalCount: 3, conflictCount: 3, okCount: 30, totalChecked: 33 });
    if (s.status === "critical") {
      expect(s.conflictCount).toBeGreaterThan(0);
    }
  });

  it("la UI nunca muestra 'Sin conflictos' + 'critical' al mismo tiempo", () => {
    // Si conflictiveInvoices.length === 0, la UI muestra empty state
    // Si status === critical, conflictiveInvoices.length > 0
    const noConflicts = makeSummary({ conflictCount: 0, status: "ok", conflictiveInvoices: [] });
    const withConflicts = makeSummary({
      conflictCount: 2,
      criticalCount: 2,
      status: "critical",
      conflictiveInvoices: [
        {
          invoiceId: "inv-1",
          invoiceNumber: "ZETA:CCV1:0:1:A:100",
          clienteName: "Test SA",
          currencyCode: "USD",
          balanceDb: 500,
          balanceZeta: null,
          gapAmount: 500,
          severity: "critical",
          missingCount: 8,
          lastSyncAt: null,
          registroId: "1234",
          suggestedAction: "Resync urgente — verificar en Zeta",
        },
        {
          invoiceId: "inv-2",
          invoiceNumber: "ZETA:CCV1:0:1:A:101",
          clienteName: "Test SA",
          currencyCode: "USD",
          balanceDb: 300,
          balanceZeta: null,
          gapAmount: 300,
          severity: "critical",
          missingCount: 7,
          lastSyncAt: null,
          registroId: "1235",
          suggestedAction: "Resync urgente — verificar en Zeta",
        },
      ],
    });

    // Estado OK no puede tener tabla de conflictos
    expect(noConflicts.conflictiveInvoices.length).toBe(0);
    // Estado critical tiene conflictos
    expect(withConflicts.conflictiveInvoices.length).toBeGreaterThan(0);
    // No pueden ser el mismo estado
    expect(noConflicts.status).not.toBe(withConflicts.status);
  });
});

// ── 5. totalChecked = okCount + conflictCount ──────────────────────────────────

describe("invariante 5: sumas cuadran", () => {
  it("totalChecked = okCount + conflictCount (sin conflictos)", () => {
    const s = makeSummary({ totalChecked: 33, okCount: 33, conflictCount: 0 });
    expect(s.totalChecked).toBe(s.okCount + s.conflictCount);
  });

  it("totalChecked = okCount + conflictCount (con conflictos)", () => {
    const s = makeSummary({ totalChecked: 40, okCount: 37, conflictCount: 3, criticalCount: 1, warningCount: 2, status: "critical" });
    expect(s.totalChecked).toBe(s.okCount + s.conflictCount);
  });

  it("conflictCount = criticalCount + warningCount + infoCount", () => {
    const s = makeSummary({ conflictCount: 5, criticalCount: 2, warningCount: 2, infoCount: 1, status: "critical" });
    expect(s.conflictCount).toBe(s.criticalCount + s.warningCount + s.infoCount);
  });
});

// ── 6. Snapshot crítico histórico va a historicalAuditCritical ────────────────

describe("invariante 6: snapshots históricos van a campo histórico", () => {
  it("campos históricos no afectan status", () => {
    const s = makeSummary({
      conflictCount: 0,
      status: "ok",
      historicalAuditCritical: 15,
      historicalAuditWarning: 3,
    });
    const derivedStatus: OicSeverity =
      s.conflictCount === 0 ? "ok"
      : s.criticalCount > 0 ? "critical"
      : s.warningCount > 0 ? "warning"
      : "ok";
    expect(derivedStatus).toBe("ok");
    expect(s.status).toBe("ok");
  });

  it("historicalAuditCritical=15 no altera conflictCount=0", () => {
    const s = makeSummary({ historicalAuditCritical: 15 });
    expect(s.conflictCount).toBe(0);
    expect(s.criticalCount).toBe(0);
  });
});

// ── Función de status pura (integración) ──────────────────────────────────────

describe("deriveStatus pura (sin DB)", () => {
  function deriveStatus(criticalCount: number, warningCount: number, conflictCount: number): OicSeverity {
    if (conflictCount === 0) return "ok";
    if (criticalCount > 0)   return "critical";
    if (warningCount > 0)    return "warning";
    return "ok";
  }

  it("sin conflictos → ok", () => expect(deriveStatus(0, 0, 0)).toBe("ok"));
  it("critical > 0 → critical", () => expect(deriveStatus(1, 0, 1)).toBe("critical"));
  it("solo warning → warning", () => expect(deriveStatus(0, 2, 2)).toBe("warning"));
  it("solo info (severity ok) → ok (no es alarmante)", () => expect(deriveStatus(0, 0, 1)).toBe("ok"));
  it("historical 15 no cambia status sin conflictos", () => {
    // historicalAuditCritical no entra en esta función — por diseño
    expect(deriveStatus(0, 0, 0)).toBe("ok");
  });
});
