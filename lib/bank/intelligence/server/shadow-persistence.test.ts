import { describe, expect, it } from "vitest";

import {
  decideShadowPersistAction,
  hasInsufficientEvidence,
  isIdenticalSuggestion,
  isSubstantialSuggestionChange,
} from "@/lib/bank/intelligence/server/shadow-persistence";
import {
  applyShadowPersistDecision,
  emptyPersistStats,
  type ShadowPersistPorts,
} from "@/lib/bank/intelligence/server/shadow-persist-apply";
import type {
  ShadowProposal,
  ShadowSuggestionRow,
} from "@/lib/bank/intelligence/server/types";
import { assertShadowWriteAllowed, ShadowGuardError } from "@/lib/bank/intelligence/server/guards";

const WS = "11111111-1111-1111-1111-111111111111";

function proposal(o: Partial<ShadowProposal> = {}): ShadowProposal {
  return {
    workspaceId: WS,
    bankMovementId: "m1",
    payerIdentityId: null,
    proposedClientId: "c1",
    proposedReceiptId: "r1",
    confidence: 90,
    reasons: ["CONFIRMED_PAYER", "MATCHING_RECEIPT"],
    warnings: [],
    recommendedAction: "REVIEW",
    engineVersion: 1,
    movementFingerprint: "mh",
    payerFingerprint: "ph",
    candidateEvidence: {
      payerFingerprintStrength: "name",
      matchedClientIds: ["c1"],
      matchedReceiptIds: ["r1"],
      invoiceAllocationIds: [],
      historicalLinkStatuses: [],
      dateWindowDays: 7,
      reasons: ["CONFIRMED_PAYER", "MATCHING_RECEIPT"],
      warnings: [],
    },
    generatedAt: "2026-07-17T12:00:00.000Z",
    proposedInvoiceAllocations: [],
    ...o,
  };
}

function row(o: Partial<ShadowSuggestionRow> = {}): ShadowSuggestionRow {
  return {
    id: "s1",
    workspaceId: WS,
    bankMovementId: "m1",
    payerIdentityId: null,
    proposedClientId: "c1",
    proposedReceiptId: "r1",
    confidence: 90,
    reasons: ["CONFIRMED_PAYER", "MATCHING_RECEIPT"],
    warnings: [],
    recommendedAction: "REVIEW",
    engineVersion: 1,
    status: "generated",
    confirmedLinkId: null,
    createdAt: "2026-07-17T11:00:00.000Z",
    updatedAt: "2026-07-17T11:00:00.000Z",
    ...o,
  };
}

describe("shadow-persistence — idempotencia y superseded", () => {
  it("detecta evidencia insuficiente", () => {
    expect(
      hasInsufficientEvidence(
        proposal({
          recommendedAction: "UNIDENTIFIED",
          confidence: 10,
          proposedClientId: null,
          proposedReceiptId: null,
          reasons: [],
        })
      )
    ).toBe(true);
    expect(hasInsufficientEvidence(proposal())).toBe(false);
  });

  it("create cuando no hay activa", () => {
    expect(
      decideShadowPersistAction({ proposal: proposal(), existingActive: null })
    ).toEqual({ action: "create" });
  });

  it("skip idempotente si idéntica", () => {
    const p = proposal();
    const existing = row();
    expect(isIdenticalSuggestion(existing, p)).toBe(true);
    expect(decideShadowPersistAction({ proposal: p, existingActive: existing })).toEqual({
      action: "skip",
      reason: "IDEMPOTENT_UNCHANGED",
    });
  });

  it("supersede ante cambio sustancial", () => {
    const existing = row({ confidence: 90, proposedClientId: "c1" });
    const p = proposal({ confidence: 96, proposedClientId: "c2", recommendedAction: "AUTO_RECONCILE_CANDIDATE" });
    expect(isSubstantialSuggestionChange(existing, p)).toBe(true);
    expect(decideShadowPersistAction({ proposal: p, existingActive: existing })).toEqual({
      action: "supersede",
      existingId: "s1",
      previousStatus: "generated",
    });
  });

  it("protege confirmed / rejected / reversed / superseded", () => {
    for (const status of ["confirmed", "rejected", "reversed", "superseded"] as const) {
      const d = decideShadowPersistAction({
        proposal: proposal({ confidence: 99 }),
        existingActive: row({ status }),
      });
      expect(d.action).toBe("skip");
      expect(d).toMatchObject({ reason: expect.stringContaining("PROTECTED_") });
    }
  });

  it("skip por evidencia insuficiente", () => {
    expect(
      decideShadowPersistAction({
        proposal: proposal({
          recommendedAction: "UNIDENTIFIED",
          confidence: 5,
          proposedClientId: null,
          proposedReceiptId: null,
          reasons: [],
        }),
        existingActive: null,
      })
    ).toEqual({ action: "skip", reason: "INSUFFICIENT_EVIDENCE" });
  });
});

describe("applyShadowPersistDecision — solo suggestions/events", () => {
  it("dry-run conceptual: sin ports no se llama (stats skip vía decision)", async () => {
    const stats = emptyPersistStats();
    const writes: string[] = [];
    const ports: ShadowPersistPorts = {
      async insertSuggestion() {
        writes.push("insertSuggestion");
        return row();
      },
      async updateSuggestion() {
        writes.push("updateSuggestion");
        return row();
      },
      async supersedeSuggestion() {
        writes.push("supersedeSuggestion");
      },
      async insertEvent() {
        writes.push("insertEvent");
      },
    };
    await applyShadowPersistDecision({
      proposal: proposal(),
      decision: { action: "skip", reason: "IDEMPOTENT_UNCHANGED" },
      ports,
      stats,
    });
    expect(writes).toEqual([]);
    expect(stats.skipped).toBe(1);
  });

  it("create escribe suggestion + event", async () => {
    const stats = emptyPersistStats();
    const writes: string[] = [];
    const ports: ShadowPersistPorts = {
      async insertSuggestion(p) {
        writes.push(`insertSuggestion:${p.bankMovementId}`);
        return row({ id: "new-s" });
      },
      async updateSuggestion() {
        writes.push("updateSuggestion");
        return row();
      },
      async supersedeSuggestion() {
        writes.push("supersedeSuggestion");
      },
      async insertEvent(e) {
        writes.push(`insertEvent:${e.eventType}`);
      },
    };
    await applyShadowPersistDecision({
      proposal: proposal(),
      decision: { action: "create" },
      ports,
      stats,
    });
    expect(writes).toEqual(["insertSuggestion:m1", "insertEvent:suggestion_created"]);
    expect(stats.created).toBe(1);
  });

  it("supersede marca anterior + crea nueva + events", async () => {
    const stats = emptyPersistStats();
    const writes: string[] = [];
    const ports: ShadowPersistPorts = {
      async insertSuggestion() {
        writes.push("insertSuggestion");
        return row({ id: "s2" });
      },
      async updateSuggestion() {
        writes.push("updateSuggestion");
        return row();
      },
      async supersedeSuggestion(id) {
        writes.push(`supersede:${id}`);
      },
      async insertEvent(e) {
        writes.push(`event:${e.eventType}`);
      },
    };
    await applyShadowPersistDecision({
      proposal: proposal({ confidence: 99 }),
      decision: { action: "supersede", existingId: "s1", previousStatus: "generated" },
      ports,
      stats,
    });
    expect(writes).toEqual([
      "supersede:s1",
      "event:suggestion_superseded",
      "insertSuggestion",
      "event:suggestion_created",
    ]);
    expect(stats.superseded).toBe(1);
    expect(stats.created).toBe(1);
  });

  it("imposible escribir links/allocations/tablas financieras vía guardas", () => {
    for (const table of [
      "bank_movement_reconciliation_links",
      "payment_allocations",
      "bank_movements",
      "proto_receipts",
      "proto_invoices",
    ]) {
      expect(() => assertShadowWriteAllowed(table, "insert")).toThrow(ShadowGuardError);
      expect(() => assertShadowWriteAllowed(table, "update")).toThrow(ShadowGuardError);
    }
  });
});
