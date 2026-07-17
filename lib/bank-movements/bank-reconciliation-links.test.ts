import { describe, it, expect } from "vitest";

import {
  deriveReconciliationStatus,
  validateReconciliationApplication,
  sumAppliedByMovement,
  remainingToApply,
  netNewMoneyFromReconciliation,
  type ReconciliationLink,
} from "@/lib/bank-movements/bank-reconciliation-links";

function link(overrides: Partial<ReconciliationLink> = {}): ReconciliationLink {
  return {
    id: "l1",
    bankMovementId: "m1",
    targetType: "receipt",
    targetId: "r1",
    appliedAmount: 100,
    currency: "UYU",
    direction: "inflow",
    method: "manual",
    confidence: null,
    archivedAt: null,
    ...overrides,
  };
}

describe("deriveReconciliationStatus", () => {
  it("pending sin relaciones", () => {
    expect(deriveReconciliationStatus(1000, [])).toBe("pending");
  });
  it("partial cuando aplica menos que el total", () => {
    expect(deriveReconciliationStatus(1000, [link({ appliedAmount: 400 })])).toBe("partial");
  });
  it("reconciled cuando aplica el total (con tolerancia)", () => {
    expect(deriveReconciliationStatus(1000, [link({ appliedAmount: 600 }), link({ id: "l2", appliedAmount: 400 })])).toBe("reconciled");
    expect(deriveReconciliationStatus(1000, [link({ appliedAmount: 999.995 })])).toBe("reconciled");
  });
  it("ignored gana sobre aplicaciones", () => {
    expect(deriveReconciliationStatus(1000, [link({ targetType: "ignored", targetId: null, appliedAmount: 1 })])).toBe("ignored");
  });
  it("duplicate por flag", () => {
    expect(deriveReconciliationStatus(1000, [], { duplicate: true })).toBe("duplicate");
  });
  it("ignora relaciones archivadas", () => {
    expect(deriveReconciliationStatus(1000, [link({ appliedAmount: 1000, archivedAt: "2026-07-16" })])).toBe("pending");
  });
});

describe("validateReconciliationApplication", () => {
  const base = {
    movementAmount: 1000,
    movementCurrency: "UYU",
    movementDirection: "inflow" as const,
    alreadyApplied: 0,
    targetCurrency: "UYU",
  };
  it("acepta una aplicación válida y calcula el remanente", () => {
    const r = validateReconciliationApplication({ ...base, newApplied: 400 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remainingAfter).toBe(600);
  });
  it("bloquea importe no positivo", () => {
    expect(validateReconciliationApplication({ ...base, newApplied: 0 })).toMatchObject({ ok: false, code: "INVALID_AMOUNT" });
  });
  it("bloquea cruce de monedas", () => {
    expect(validateReconciliationApplication({ ...base, newApplied: 100, targetCurrency: "USD" })).toMatchObject({ ok: false, code: "CROSS_CURRENCY" });
  });
  it("bloquea cruce de dirección", () => {
    expect(
      validateReconciliationApplication({ ...base, newApplied: 100, targetDirection: "outflow" })
    ).toMatchObject({ ok: false, code: "CROSS_DIRECTION" });
  });
  it("bloquea sobre-aplicación", () => {
    expect(validateReconciliationApplication({ ...base, alreadyApplied: 800, newApplied: 300 })).toMatchObject({ ok: false, code: "OVER_APPLIED" });
  });
  it("permite aplicar exactamente el remanente", () => {
    expect(validateReconciliationApplication({ ...base, alreadyApplied: 700, newApplied: 300 }).ok).toBe(true);
  });
});

describe("sumAppliedByMovement / remainingToApply", () => {
  it("suma solo relaciones activas aplicantes", () => {
    const links = [
      link({ id: "a", bankMovementId: "m1", appliedAmount: 300 }),
      link({ id: "b", bankMovementId: "m1", appliedAmount: 200 }),
      link({ id: "c", bankMovementId: "m1", appliedAmount: 999, archivedAt: "2026-07-16" }),
      link({ id: "d", bankMovementId: "m1", targetType: "ignored", targetId: null, appliedAmount: 5 }),
    ];
    expect(sumAppliedByMovement(links).get("m1")).toBe(500);
    expect(remainingToApply(1000, links)).toBe(500);
  });
});

describe("no double counting identity", () => {
  it("una conciliación nunca aporta dinero nuevo (identidad = 0)", () => {
    const links = [link({ appliedAmount: 1000 }), link({ id: "l2", appliedAmount: 500 })];
    expect(netNewMoneyFromReconciliation(links)).toBe(0);
  });
});
