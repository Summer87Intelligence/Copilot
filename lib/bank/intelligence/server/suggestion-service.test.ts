import { describe, expect, it } from "vitest";

import type { PayerFingerprint } from "@/lib/bank/intelligence/payer-fingerprint";
import type {
  NormalizedBankMovement,
  ReconciliationCandidateResult,
} from "@/lib/bank/intelligence/reconciliation-matching";
import type { ShadowMovementContext } from "@/lib/bank/intelligence/server/loaders/shadow-context-loader";
import {
  buildShadowProposalFromContext,
  filterContextToWorkspace,
} from "@/lib/bank/intelligence/server/suggestion-service";
import { mapMatchResultToProposal } from "@/lib/bank/intelligence/server/mappers";
import { matchBankMovement } from "@/lib/bank/intelligence/reconciliation-matching";

const WS = "11111111-1111-1111-1111-111111111111";
const WS_B = "22222222-2222-2222-2222-222222222222";
const PAYER = "fp-pepito";

function fp(hash = PAYER): PayerFingerprint {
  return {
    version: 1,
    strength: "name",
    hash,
    maskedAccount: null,
    normalizedName: "pepito",
  };
}

function mov(o: Partial<NormalizedBankMovement> = {}): NormalizedBankMovement {
  return {
    id: "m1",
    workspaceId: WS,
    amountMinor: 100000,
    currency: "UYU",
    direction: "inflow",
    date: "2026-07-08",
    payerFingerprintHash: PAYER,
    normalizedPayerName: "pepito",
    ...o,
  };
}

function ctx(
  overrides: Partial<ShadowMovementContext> = {}
): ShadowMovementContext {
  const movement = overrides.movement ?? mov();
  return {
    row: {
      id: movement.id,
      workspace_id: movement.workspaceId,
      bank_name: "Santander",
      account_label: "EASY",
      movement_date: movement.date,
      description: "Pepito",
      raw_description: null,
      amount: 1000,
      currency: movement.currency,
      direction: movement.direction,
      bank_reference: null,
      status: "pending",
      metadata: null,
    },
    movement,
    payerFp: overrides.payerFp ?? fp(),
    movementFpHash: overrides.movementFpHash ?? "mov-hash-1",
    payerIdentity: overrides.payerIdentity ?? null,
    clients: overrides.clients ?? [
      { clientId: "elpais", workspaceId: WS, normalizedName: "el pais" },
    ],
    receipts: overrides.receipts ?? [],
    invoices: overrides.invoices ?? [],
    historicalLinks: overrides.historicalLinks ?? [],
    dateWindowDays: 7,
    ...overrides,
  };
}

describe("suggestion-service — propuestas shadow", () => {
  it("aisla workspace: candidatos de otro WS no contaminan", () => {
    const filtered = filterContextToWorkspace(
      ctx({
        clients: [
          { clientId: "a", workspaceId: WS, normalizedName: "pepito" },
          { clientId: "b", workspaceId: WS_B, normalizedName: "pepito" },
        ],
        receipts: [
          {
            receiptId: "r-b",
            clientId: "b",
            workspaceId: WS_B,
            amountMinor: 100000,
            currency: "UYU",
            date: "2026-07-08",
          },
        ],
      }),
      WS
    );
    expect(filtered.clients).toHaveLength(1);
    expect(filtered.receipts).toHaveLength(0);

    const proposal = buildShadowProposalFromContext(filtered);
    expect(proposal.workspaceId).toBe(WS);
    expect(proposal.warnings).not.toContain("WORKSPACE_MISMATCH");
  });

  it("pagador conocido + recibo exacto → AUTO_RECONCILE_CANDIDATE con reasons", () => {
    const proposal = buildShadowProposalFromContext(
      ctx({
        historicalLinks: [
          {
            fingerprintHash: PAYER,
            clientId: "elpais",
            workspaceId: WS,
            status: "confirmed",
            paymentsCount: 18,
          },
        ],
        receipts: [
          {
            receiptId: "rc1",
            clientId: "elpais",
            workspaceId: WS,
            amountMinor: 100000,
            currency: "UYU",
            date: "2026-07-08",
          },
        ],
        clients: [{ clientId: "elpais", workspaceId: WS, normalizedName: "el pais" }],
      })
    );
    expect(proposal.recommendedAction).toBe("AUTO_RECONCILE_CANDIDATE");
    expect(proposal.proposedClientId).toBe("elpais");
    expect(proposal.proposedReceiptId).toBe("rc1");
    expect(proposal.confidence).toBeGreaterThanOrEqual(95);
    expect(proposal.reasons).toEqual(
      expect.arrayContaining([
        "CONFIRMED_PAYER",
        "MATCHING_RECEIPT",
        "EXACT_AMOUNT",
        "DATE_PROXIMITY",
      ])
    );
    expect(proposal.engineVersion).toBe(1);
    expect(proposal.movementFingerprint).toBeTruthy();
    expect(proposal.payerFingerprint).toBe(PAYER);
    expect(proposal.candidateEvidence.matchedReceiptIds).toContain("rc1");
  });

  it("pagador desconocido → UNIDENTIFIED o REVIEW sin cliente inventado", () => {
    const proposal = buildShadowProposalFromContext(
      ctx({
        movement: mov({
          payerFingerprintHash: "fp-unknown",
          normalizedPayerName: "alguien raro",
        }),
        payerFp: fp("fp-unknown"),
        clients: [{ clientId: "elpais", workspaceId: WS, normalizedName: "el pais" }],
        historicalLinks: [],
        receipts: [],
      })
    );
    expect(["UNIDENTIFIED", "REVIEW"]).toContain(proposal.recommendedAction);
    expect(proposal.proposedClientId).toBeNull();
    expect(proposal.proposedReceiptId).toBeNull();
  });

  it("clientes ambiguos / empate → REVIEW + MULTIPLE_STRONG_CANDIDATES", () => {
    const proposal = buildShadowProposalFromContext(
      ctx({
        movement: mov({
          payerFingerprintHash: "fp-unknown",
          normalizedPayerName: "grupo x",
        }),
        payerFp: fp("fp-unknown"),
        clients: [
          { clientId: "a", workspaceId: WS, normalizedName: "grupo x" },
          { clientId: "b", workspaceId: WS, normalizedName: "grupo x" },
        ],
      })
    );
    expect(proposal.recommendedAction).toBe("REVIEW");
    expect(proposal.warnings).toContain("MULTIPLE_STRONG_CANDIDATES");
    expect(proposal.proposedClientId).toBeNull();
  });

  it("moneda distinta → REJECT + CURRENCY_MISMATCH", () => {
    const proposal = buildShadowProposalFromContext(
      ctx({
        historicalLinks: [
          {
            fingerprintHash: PAYER,
            clientId: "elpais",
            workspaceId: WS,
            status: "confirmed",
            paymentsCount: 5,
          },
        ],
        receipts: [
          {
            receiptId: "rc1",
            clientId: "elpais",
            workspaceId: WS,
            amountMinor: 100000,
            currency: "USD",
            date: "2026-07-08",
          },
        ],
      })
    );
    expect(proposal.recommendedAction).toBe("REJECT");
    expect(proposal.reasons).toContain("CURRENCY_MISMATCH");
  });

  it("importe parcial → allocation ≤ saldo sin inventar", () => {
    const proposal = buildShadowProposalFromContext(
      ctx({
        movement: mov({ amountMinor: 40000 }),
        historicalLinks: [
          {
            fingerprintHash: PAYER,
            clientId: "elpais",
            workspaceId: WS,
            status: "confirmed",
            paymentsCount: 5,
          },
        ],
        invoices: [
          {
            invoiceId: "f1",
            clientId: "elpais",
            workspaceId: WS,
            currency: "UYU",
            outstandingMinor: 100000,
            date: "2026-07-01",
          },
        ],
      })
    );
    expect(proposal.proposedInvoiceAllocations).toEqual([
      { invoiceId: "f1", amountMinor: 40000 },
    ]);
  });

  it("recibo ya consumido → no propone ese recibo + warning", () => {
    const proposal = buildShadowProposalFromContext(
      ctx({
        historicalLinks: [
          {
            fingerprintHash: PAYER,
            clientId: "elpais",
            workspaceId: WS,
            status: "confirmed",
            paymentsCount: 5,
          },
        ],
        receipts: [
          {
            receiptId: "rc1",
            clientId: "elpais",
            workspaceId: WS,
            amountMinor: 100000,
            currency: "UYU",
            date: "2026-07-08",
            alreadyReconciled: true,
          },
        ],
      })
    );
    expect(proposal.proposedReceiptId).toBeNull();
    expect(proposal.warnings).toContain("RECEIPT_ALREADY_RECONCILED");
  });

  it("movimiento no conciliable (egreso) → NON_COMMERCIAL / UNIDENTIFIED", () => {
    const proposal = buildShadowProposalFromContext(
      ctx({ movement: mov({ direction: "outflow" }) })
    );
    expect(proposal.warnings).toContain("NON_COMMERCIAL");
    expect(proposal.recommendedAction).not.toBe("AUTO_RECONCILE_CANDIDATE");
  });

  it("mapMatchResultToProposal expone contrato mínimo", () => {
    const result: ReconciliationCandidateResult = {
      clientId: "c1",
      receiptId: "r1",
      invoiceAllocations: [],
      confidence: 88,
      reasons: ["CONFIRMED_PAYER"],
      warnings: ["UNAPPLIED_BALANCE"],
      recommendedAction: "REVIEW",
    };
    const p = mapMatchResultToProposal({
      workspaceId: WS,
      bankMovementId: "m1",
      payerIdentityId: null,
      payerFp: fp(),
      movementFpHash: "mh",
      result,
      dateWindowDays: 7,
      generatedAt: "2026-07-17T12:00:00.000Z",
    });
    expect(p).toMatchObject({
      workspaceId: WS,
      bankMovementId: "m1",
      confidence: 88,
      recommendedAction: "REVIEW",
      generatedAt: "2026-07-17T12:00:00.000Z",
    });
  });

  it("motor puro: misma entrada → misma propuesta", () => {
    const input = {
      movement: mov(),
      clients: [{ clientId: "elpais", workspaceId: WS, normalizedName: "el pais" }],
      receipts: [
        {
          receiptId: "rc1",
          clientId: "elpais",
          workspaceId: WS,
          amountMinor: 100000,
          currency: "UYU" as const,
          date: "2026-07-08",
        },
      ],
      invoices: [],
      historicalLinks: [
        {
          fingerprintHash: PAYER,
          clientId: "elpais",
          workspaceId: WS,
          status: "confirmed" as const,
          paymentsCount: 18,
        },
      ],
    };
    expect(matchBankMovement(input)).toEqual(matchBankMovement(input));
  });
});
