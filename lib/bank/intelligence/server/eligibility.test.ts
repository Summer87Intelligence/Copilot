import { describe, expect, it } from "vitest";

import {
  isShadowEligibleMovement,
  type ShadowEligibilityMovement,
} from "@/lib/bank/intelligence/server/eligibility";
import {
  applyMatchedAuditPolicy,
  applyHistoricalAuditPolicy,
} from "@/lib/bank/intelligence/server/suggestion-service";
import type { ShadowProposal } from "@/lib/bank/intelligence/server/types";

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function mv(over: Partial<ShadowEligibilityMovement> = {}): ShadowEligibilityMovement {
  return {
    id: "m1",
    workspaceId: WS,
    status: "pending",
    direction: "inflow",
    movementDate: "2026-07-08", // >= corte 2026-07-01
    ...over,
  };
}

function proposal(over: Partial<ShadowProposal> = {}): ShadowProposal {
  return {
    workspaceId: WS,
    bankMovementId: "m1",
    payerIdentityId: null,
    proposedClientId: null,
    proposedReceiptId: null,
    confidence: 50,
    reasons: [],
    warnings: [],
    recommendedAction: "REVIEW",
    engineVersion: 1,
    movementFingerprint: "f",
    payerFingerprint: "p",
    candidateEvidence: {
      payerFingerprintStrength: "weak",
      matchedClientIds: [],
      matchedReceiptIds: [],
      tiedCandidates: [],
      invoiceAllocationIds: [],
      historicalLinkStatuses: [],
      dateWindowDays: 7,
      reasons: [],
      warnings: [],
      ambiguityReason: null,
      collisionDetected: false,
    },
    generatedAt: "2026-07-17T00:00:00.000Z",
    proposedInvoiceAllocations: [],
    tiedCandidates: [],
    ambiguityReason: null,
    collisionDetected: false,
    ...over,
  };
}

const base = { workspaceId: WS, hasActiveCanonicalLink: false };

describe("isShadowEligibleMovement — política conservadora", () => {
  it("pending válido (inflow, post-corte, sin link) → elegible no-audit", () => {
    expect(isShadowEligibleMovement({ movement: mv(), ...base })).toEqual({
      eligible: true,
      auditOnly: false,
    });
    for (const status of ["suggested", "needs_review"] as const) {
      expect(isShadowEligibleMovement({ movement: mv({ status }), ...base }).eligible).toBe(true);
    }
  });

  it("matched excluido por defecto (includeMatchedForAudit ausente/false)", () => {
    expect(isShadowEligibleMovement({ movement: mv({ status: "matched" }), ...base })).toEqual({
      eligible: false,
      skipReason: "MOVEMENT_ALREADY_MATCHED",
    });
    expect(
      isShadowEligibleMovement({
        movement: mv({ status: "matched" }),
        ...base,
        includeMatchedForAudit: false,
      })
    ).toEqual({ eligible: false, skipReason: "MOVEMENT_ALREADY_MATCHED" });
  });

  it("matched + includeMatchedForAudit=true → audit-only", () => {
    expect(
      isShadowEligibleMovement({
        movement: mv({ status: "matched" }),
        ...base,
        includeMatchedForAudit: true,
      })
    ).toEqual({ eligible: true, auditOnly: true, auditReason: "MATCHED_MOVEMENT_AUDIT" });
  });

  it("excluye ignored / reversed / outflow", () => {
    expect(isShadowEligibleMovement({ movement: mv({ status: "ignored" }), ...base })).toMatchObject({
      eligible: false,
      skipReason: "MOVEMENT_IGNORED",
    });
    expect(isShadowEligibleMovement({ movement: mv({ status: "reversed" }), ...base })).toMatchObject({
      eligible: false,
      skipReason: "MOVEMENT_REVERSED",
    });
    expect(
      isShadowEligibleMovement({ movement: mv({ direction: "outflow" }), ...base })
    ).toMatchObject({ eligible: false, skipReason: "NON_COMMERCIAL_DIRECTION" });
  });

  it("excluye por link canónico activo (aun matched+audit)", () => {
    expect(
      isShadowEligibleMovement({ movement: mv(), workspaceId: WS, hasActiveCanonicalLink: true })
    ).toMatchObject({ eligible: false, skipReason: "MOVEMENT_HAS_ACTIVE_LINK" });
    // El link activo tiene prioridad sobre el modo audit.
    expect(
      isShadowEligibleMovement({
        movement: mv({ status: "matched" }),
        workspaceId: WS,
        hasActiveCanonicalLink: true,
        includeMatchedForAudit: true,
      })
    ).toMatchObject({ eligible: false, skipReason: "MOVEMENT_HAS_ACTIVE_LINK" });
  });

  it("excluye anterior al corte operativo (2026-07-01)", () => {
    expect(
      isShadowEligibleMovement({ movement: mv({ movementDate: "2026-06-30" }), ...base })
    ).toMatchObject({ eligible: false, skipReason: "MOVEMENT_BEFORE_CUTOFF" });
  });

  it("excluye fuera del workspace", () => {
    expect(
      isShadowEligibleMovement({ movement: mv({ workspaceId: "other" }), ...base })
    ).toMatchObject({ eligible: false, skipReason: "WORKSPACE_MISMATCH" });
  });

  it("status desconocido → no elegible (conservador)", () => {
    expect(
      isShadowEligibleMovement({ movement: mv({ status: "weird_status" }), ...base })
    ).toMatchObject({ eligible: false, skipReason: "MOVEMENT_STATUS_NOT_ELIGIBLE" });
  });

  it("decisión idéntica sin importar el camino (ID único vs lista vs auto)", () => {
    // La función es pura respecto del movimiento; el 'camino' no la altera.
    const movement = mv({ status: "matched" });
    const single = isShadowEligibleMovement({ movement, ...base });
    const inList = isShadowEligibleMovement({ movement: { ...movement }, ...base });
    expect(single).toEqual(inList);
    expect(single).toEqual({ eligible: false, skipReason: "MOVEMENT_ALREADY_MATCHED" });
  });
});

describe("isShadowEligibleMovement — modo histórico", () => {
  const pre = { movementDate: "2026-06-15" }; // < 2026-07-01 pero >= 2026-01-01

  it("pre-corte normal (sin flag) → skipped MOVEMENT_BEFORE_CUTOFF", () => {
    expect(isShadowEligibleMovement({ movement: mv(pre), ...base })).toEqual({
      eligible: false,
      skipReason: "MOVEMENT_BEFORE_CUTOFF",
    });
  });

  it("pre-corte + includeHistoricalForShadow=true → historical-audit", () => {
    expect(
      isShadowEligibleMovement({ movement: mv(pre), ...base, includeHistoricalForShadow: true })
    ).toEqual({
      eligible: true,
      auditOnly: true,
      auditReason: "HISTORICAL_SHADOW_AUDIT",
      historical: true,
    });
  });

  it("anterior a 2026-01-01 → SIEMPRE excluido (aun con flag histórico)", () => {
    expect(
      isShadowEligibleMovement({ movement: mv({ movementDate: "2025-12-31" }), ...base })
    ).toMatchObject({ eligible: false, skipReason: "MOVEMENT_BEFORE_GLOBAL_FLOOR" });
    expect(
      isShadowEligibleMovement({
        movement: mv({ movementDate: "2025-12-31" }),
        ...base,
        includeHistoricalForShadow: true,
      })
    ).toMatchObject({ eligible: false, skipReason: "MOVEMENT_BEFORE_GLOBAL_FLOOR" });
  });

  it("matched histórico sigue excluido con flag histórico", () => {
    expect(
      isShadowEligibleMovement({
        movement: mv({ ...pre, status: "matched" }),
        ...base,
        includeHistoricalForShadow: true,
      })
    ).toMatchObject({ eligible: false, skipReason: "MOVEMENT_ALREADY_MATCHED" });
  });

  it("ignored/reversed/outflow históricos siguen excluidos", () => {
    const opt = { ...base, includeHistoricalForShadow: true };
    expect(
      isShadowEligibleMovement({ movement: mv({ ...pre, status: "ignored" }), ...opt })
    ).toMatchObject({ eligible: false, skipReason: "MOVEMENT_IGNORED" });
    expect(
      isShadowEligibleMovement({ movement: mv({ ...pre, status: "reversed" }), ...opt })
    ).toMatchObject({ eligible: false, skipReason: "MOVEMENT_REVERSED" });
    expect(
      isShadowEligibleMovement({ movement: mv({ ...pre, direction: "outflow" }), ...opt })
    ).toMatchObject({ eligible: false, skipReason: "NON_COMMERCIAL_DIRECTION" });
  });

  it("link activo / workspace mismatch históricos siguen excluyendo", () => {
    expect(
      isShadowEligibleMovement({
        movement: mv(pre),
        workspaceId: WS,
        hasActiveCanonicalLink: true,
        includeHistoricalForShadow: true,
      })
    ).toMatchObject({ eligible: false, skipReason: "MOVEMENT_HAS_ACTIVE_LINK" });
    expect(
      isShadowEligibleMovement({
        movement: mv({ ...pre, workspaceId: "other" }),
        ...base,
        includeHistoricalForShadow: true,
      })
    ).toMatchObject({ eligible: false, skipReason: "WORKSPACE_MISMATCH" });
  });

  it("post-corte NO se marca histórico aunque el flag esté activo", () => {
    expect(
      isShadowEligibleMovement({
        movement: mv({ movementDate: "2026-07-08" }),
        ...base,
        includeHistoricalForShadow: true,
      })
    ).toEqual({ eligible: true, auditOnly: false });
  });
});

describe("applyHistoricalAuditPolicy — historical-audit", () => {
  it("marca historicalAudit+auditOnly, agrega HISTORICAL_SHADOW_AUDIT y nunca AUTO", () => {
    const audited = applyHistoricalAuditPolicy(
      proposal({ recommendedAction: "AUTO_RECONCILE_CANDIDATE", confidence: 99 })
    );
    expect(audited.historicalAudit).toBe(true);
    expect(audited.auditOnly).toBe(true);
    expect(audited.recommendedAction).toBe("REVIEW");
    expect(audited.warnings).toContain("HISTORICAL_SHADOW_AUDIT");
    expect(audited.candidateEvidence.warnings).toContain("HISTORICAL_SHADOW_AUDIT");
  });
});

describe("applyMatchedAuditPolicy — audit-only", () => {
  it("marca auditOnly, agrega MATCHED_MOVEMENT_AUDIT y nunca AUTO", () => {
    const audited = applyMatchedAuditPolicy(
      proposal({ recommendedAction: "AUTO_RECONCILE_CANDIDATE", confidence: 99 })
    );
    expect(audited.auditOnly).toBe(true);
    expect(audited.recommendedAction).toBe("REVIEW");
    expect(audited.warnings).toContain("MATCHED_MOVEMENT_AUDIT");
    expect(audited.candidateEvidence.warnings).toContain("MATCHED_MOVEMENT_AUDIT");
  });

  it("preserva REVIEW/UNIDENTIFIED y no duplica el warning", () => {
    const audited = applyMatchedAuditPolicy(
      proposal({ recommendedAction: "REVIEW", warnings: ["MATCHED_MOVEMENT_AUDIT"] })
    );
    expect(audited.recommendedAction).toBe("REVIEW");
    expect(audited.warnings.filter((w) => w === "MATCHED_MOVEMENT_AUDIT")).toHaveLength(1);
  });
});
