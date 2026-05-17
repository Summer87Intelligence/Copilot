import { describe, expect, it } from "vitest";
import { isOperationalCriticalAudit } from "@/lib/integrations/zeta/zeta-completeness-audit-operational";
import type { CompletenessAuditResult } from "@/lib/integrations/zeta/zeta-enterprise-sync-types";

function makeAudit(overrides: Partial<CompletenessAuditResult>): CompletenessAuditResult {
  return {
    entity: "invoices",
    audit_scope: "period:2026-04",
    zeta_count: 0,
    local_count: 0,
    drift: 0,
    drift_pct: 0,
    missing_registro_ids: [],
    orphan_registro_ids: [],
    severity: "ok",
    ...overrides,
  };
}

describe("isOperationalCriticalAudit — invoices with legacy drift", () => {
  it("returns false when legacy_untraceable_count fully explains all orphan drift (zeta=0)", () => {
    // All 71 local records are legacy ZETA:CCV1: — Zeta has no accepted records for period
    const audit = makeAudit({
      entity: "invoices",
      zeta_count: 0,
      local_count: 71,
      drift: 71,
      severity: "critical",
      metadata: { legacy_untraceable_count: 71 },
    });
    expect(isOperationalCriticalAudit(audit)).toBe(false);
  });

  it("returns false when legacy covers all excess over zeta_count", () => {
    // local=139 = 68 operational + 71 legacy, zeta=68 → operationalLocal=68 → pct=0
    const audit = makeAudit({
      entity: "invoices",
      zeta_count: 68,
      local_count: 139,
      drift: 71,
      severity: "critical",
      metadata: { legacy_untraceable_count: 71 },
    });
    expect(isOperationalCriticalAudit(audit)).toBe(false);
  });

  it("returns false when severity is not critical regardless of legacy count", () => {
    const audit = makeAudit({
      entity: "invoices",
      severity: "warning",
      metadata: { legacy_untraceable_count: 10 },
    });
    expect(isOperationalCriticalAudit(audit)).toBe(false);
  });
});

describe("isOperationalCriticalAudit — invoices with real operational drift", () => {
  it("returns true when zeta has more records than operational local (missing records)", () => {
    // zeta=100, local=50, legacy=10 → operationalLocal=40 → pct=60% → critical
    const audit = makeAudit({
      entity: "invoices",
      zeta_count: 100,
      local_count: 50,
      drift: -50,
      severity: "critical",
      metadata: { legacy_untraceable_count: 10 },
    });
    expect(isOperationalCriticalAudit(audit)).toBe(true);
  });

  it("returns true when legacy count does not cover all orphan drift", () => {
    // local=200, zeta=100, legacy=10 → operationalLocal=190 → pct=90% → still critical
    const audit = makeAudit({
      entity: "invoices",
      zeta_count: 100,
      local_count: 200,
      drift: 100,
      severity: "critical",
      metadata: { legacy_untraceable_count: 10 },
    });
    expect(isOperationalCriticalAudit(audit)).toBe(true);
  });

  it("returns true when no legacy_untraceable_count in metadata", () => {
    const audit = makeAudit({
      entity: "invoices",
      zeta_count: 100,
      local_count: 50,
      drift: -50,
      severity: "critical",
    });
    expect(isOperationalCriticalAudit(audit)).toBe(true);
  });

  it("returns true when legacy_untraceable_count is 0", () => {
    const audit = makeAudit({
      entity: "invoices",
      zeta_count: 100,
      local_count: 50,
      drift: -50,
      severity: "critical",
      metadata: { legacy_untraceable_count: 0 },
    });
    expect(isOperationalCriticalAudit(audit)).toBe(true);
  });
});

describe("isOperationalCriticalAudit — receipts and contacts always operational", () => {
  it("returns true for receipts critical", () => {
    const audit = makeAudit({
      entity: "receipts",
      zeta_count: 100,
      local_count: 50,
      drift: -50,
      severity: "critical",
    });
    expect(isOperationalCriticalAudit(audit)).toBe(true);
  });

  it("returns true for contacts critical", () => {
    const audit = makeAudit({
      entity: "contacts",
      zeta_count: 100,
      local_count: 50,
      drift: -50,
      severity: "critical",
    });
    expect(isOperationalCriticalAudit(audit)).toBe(true);
  });

  it("returns false for receipts non-critical", () => {
    const audit = makeAudit({ entity: "receipts", severity: "ok" });
    expect(isOperationalCriticalAudit(audit)).toBe(false);
  });
});
