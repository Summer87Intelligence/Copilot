import { describe, expect, it } from "vitest";

import type { PayerFingerprint } from "@/lib/bank/intelligence/payer-fingerprint";
import {
  applyReceiptCollisionPolicy,
  buildShadowProposalFromContext,
} from "@/lib/bank/intelligence/server/suggestion-service";
import type { ShadowMovementContext } from "@/lib/bank/intelligence/server/loaders/shadow-context-loader";
import type { ShadowProposal } from "@/lib/bank/intelligence/server/types";
import { MAX_TIED_RECEIPT_CONFIDENCE } from "@/lib/bank/intelligence/reconciliation-matching";

const WS = "11111111-1111-1111-1111-111111111111";

function fp(hash = "fp1"): PayerFingerprint {
  return {
    version: 1,
    strength: "name",
    hash,
    maskedAccount: null,
    normalizedName: "x",
  };
}

function baseProposal(o: Partial<ShadowProposal> = {}): ShadowProposal {
  return {
    workspaceId: WS,
    bankMovementId: "m1",
    payerIdentityId: null,
    proposedClientId: "c1",
    proposedReceiptId: "rc-shared",
    confidence: 50,
    reasons: ["MATCHING_RECEIPT", "EXACT_AMOUNT"],
    warnings: [],
    recommendedAction: "REVIEW",
    engineVersion: 1,
    movementFingerprint: "mh",
    payerFingerprint: "ph",
    candidateEvidence: {
      payerFingerprintStrength: "name",
      matchedClientIds: ["c1"],
      matchedReceiptIds: ["rc-shared"],
      tiedCandidates: [],
      invoiceAllocationIds: [],
      historicalLinkStatuses: [],
      dateWindowDays: 7,
      reasons: ["MATCHING_RECEIPT", "EXACT_AMOUNT"],
      warnings: [],
      ambiguityReason: null,
      collisionDetected: false,
    },
    generatedAt: "2026-07-17T12:00:00.000Z",
    proposedInvoiceAllocations: [],
    tiedCandidates: [],
    ambiguityReason: null,
    collisionDetected: false,
    ...o,
  };
}

describe("applyReceiptCollisionPolicy", () => {
  it("dos movimientos con el mismo proposedReceiptId → RECEIPT_CANDIDATE_COLLISION", () => {
    const a = baseProposal({ bankMovementId: "92327f0d-0678-4a12-8d42-71a5cd04add8" });
    const b = baseProposal({ bankMovementId: "c8432f4c-611c-4131-be8a-7df83d6bcddb" });
    const out = applyReceiptCollisionPolicy([a, b]);
    expect(out).toHaveLength(2);
    for (const p of out) {
      expect(p.proposedReceiptId).toBeNull();
      expect(p.warnings).toContain("RECEIPT_CANDIDATE_COLLISION");
      expect(p.recommendedAction).toBe("REVIEW");
      expect(p.collisionDetected).toBe(true);
      expect(p.confidence).toBeLessThanOrEqual(MAX_TIED_RECEIPT_CONFIDENCE);
      expect(p.recommendedAction).not.toBe("AUTO_RECONCILE_CANDIDATE");
    }
  });

  it("colisión degrada AUTO a REVIEW", () => {
    const a = baseProposal({
      bankMovementId: "m-a",
      recommendedAction: "AUTO_RECONCILE_CANDIDATE",
      confidence: 96,
    });
    const b = baseProposal({
      bankMovementId: "m-b",
      recommendedAction: "AUTO_RECONCILE_CANDIDATE",
      confidence: 96,
    });
    const out = applyReceiptCollisionPolicy([a, b]);
    expect(out.every((p) => p.recommendedAction === "REVIEW")).toBe(true);
    expect(out.every((p) => p.proposedReceiptId === null)).toBe(true);
  });

  it("sin colisión no muta propuestas con recibos distintos", () => {
    const a = baseProposal({
      bankMovementId: "m1",
      proposedReceiptId: "r1",
      candidateEvidence: {
        ...baseProposal().candidateEvidence,
        matchedReceiptIds: ["r1"],
      },
    });
    const b = baseProposal({
      bankMovementId: "m2",
      proposedReceiptId: "r2",
      candidateEvidence: {
        ...baseProposal().candidateEvidence,
        matchedReceiptIds: ["r2"],
      },
    });
    const out = applyReceiptCollisionPolicy([a, b]);
    expect(out[0]?.proposedReceiptId).toBe("r1");
    expect(out[1]?.proposedReceiptId).toBe("r2");
    expect(out.every((p) => !p.collisionDetected)).toBe(true);
  });
});

describe("reproducción batch dry-run (fixtures)", () => {
  function ctxFor(
    movementId: string,
    date: string,
    receipts: ShadowMovementContext["receipts"]
  ): ShadowMovementContext {
    return {
      row: {
        id: movementId,
        workspace_id: WS,
        bank_name: "Santander",
        account_label: "EASY",
        movement_date: date,
        description: "masked",
        raw_description: null,
        amount: 17080,
        currency: "UYU",
        direction: "inflow",
        bank_reference: null,
        status: "pending",
        metadata: null,
      },
      movement: {
        id: movementId,
        workspaceId: WS,
        amountMinor: 1_708_000,
        currency: "UYU",
        direction: "inflow",
        date,
        payerFingerprintHash: "fp-x",
        normalizedPayerName: "x",
      },
      payerFp: fp("fp-x"),
      movementFpHash: `mov-${movementId.slice(0, 8)}`,
      payerIdentity: null,
      clients: [],
      receipts,
      invoices: [],
      historicalLinks: [],
      dateWindowDays: 7,
    };
  }

  const fourReceipts = [
    {
      receiptId: "e800db93-c045-414a-be05-575ab5d40fc1",
      clientId: "el",
      workspaceId: WS,
      amountMinor: 1_708_000,
      currency: "UYU" as const,
      date: "2026-06-08",
    },
    {
      receiptId: "704b36dc-19f1-42dd-a70a-a1a8befdc693",
      clientId: "a",
      workspaceId: WS,
      amountMinor: 1_708_000,
      currency: "UYU" as const,
      date: "2026-06-09",
    },
    {
      receiptId: "9276617a-bd92-4e34-819c-18fa68c7219a",
      clientId: "b",
      workspaceId: WS,
      amountMinor: 1_708_000,
      currency: "UYU" as const,
      date: "2026-06-10",
    },
    {
      receiptId: "fc58327c-34ea-4a36-89f8-1c3300d25b27",
      clientId: "c",
      workspaceId: WS,
      amountMinor: 1_708_000,
      currency: "UYU" as const,
      date: "2026-06-10",
    },
  ];

  it("92327f0d + c8432f4c en batch: sin colisión de proposedReceiptId seguro", () => {
    const p1 = buildShadowProposalFromContext(
      ctxFor("92327f0d-0678-4a12-8d42-71a5cd04add8", "2026-06-08", fourReceipts)
    );
    const p2 = buildShadowProposalFromContext(
      ctxFor("c8432f4c-611c-4131-be8a-7df83d6bcddb", "2026-06-10", fourReceipts)
    );
    // p1 may select e800 by date dominance; p2 must not select a unique unsafe winner among ties
    expect(p2.proposedReceiptId).toBeNull();
    expect(p2.warnings).toContain("MULTIPLE_STRONG_CANDIDATES");
    expect(p2.candidateEvidence.tiedCandidates.length).toBeGreaterThanOrEqual(2);

    const batch = applyReceiptCollisionPolicy([p1, p2]);
    // If p1 kept e800 and p2 had null, no collision. If both somehow shared, collision fires.
    const shared = batch.filter((p) => p.collisionDetected);
    if (p1.proposedReceiptId && p2.proposedReceiptId === p1.proposedReceiptId) {
      expect(shared).toHaveLength(2);
    } else {
      // No false collision
      expect(shared).toHaveLength(0);
      expect(batch[0]?.proposedReceiptId).toBe(p1.proposedReceiptId);
      expect(batch[1]?.proposedReceiptId).toBeNull();
    }
  });
});
